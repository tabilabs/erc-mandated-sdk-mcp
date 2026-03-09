import { ErcMandatedSdkError } from "./errors.js";
import type { AssetTransferResult } from "./assetTransferResult.js";
import type {
  FollowUpActionExecutionReference,
  FollowUpActionPlan,
  FollowUpActionResult
} from "./followUpAction.js";
import {
  applyFundAndActionExecutionEvent,
  normalizeFundAndActionExecutionSession,
  type FundAndActionExecutionEvent,
  type FundAndActionExecutionSession,
  type FundAndActionExecutionSessionStatus
} from "./fundAndActionSession.js";
import type { FundAndActionPlanOutput } from "./fundAndAction.js";

type MaybePromise<T> = T | Promise<T>;

type FundingPlan = NonNullable<FundAndActionPlanOutput["result"]["fundingPlan"]>;

export type FundAndActionExecutionTask =
  | {
      kind: "submitFunding";
      summary: string;
      fundingPlan: FundingPlan;
    }
  | {
      kind: "pollFundingResult";
      summary: string;
      assetTransferResult: AssetTransferResult;
    }
  | {
      kind: "submitFollowUp";
      summary: string;
      followUpActionPlan: FollowUpActionPlan;
    }
  | {
      kind: "pollFollowUpResult";
      summary: string;
      reference?: FollowUpActionExecutionReference;
    }
  | {
      kind: "completed";
      summary: string;
      status: FundAndActionExecutionSessionStatus;
      assetTransferResult?: AssetTransferResult;
      result?: FollowUpActionResult;
    };

export interface ResolveFundAndActionExecutionTaskInput {
  session: FundAndActionExecutionSession;
}

export interface ResolveFundAndActionExecutionTaskOutput {
  result: {
    session: FundAndActionExecutionSession;
    task: FundAndActionExecutionTask;
  };
}

export interface ExecuteFundAndActionExecutionTaskContext<TTask extends FundAndActionExecutionTask> {
  session: FundAndActionExecutionSession;
  task: TTask;
}

export interface FundAndActionFundingExecutorAdapter {
  submitFunding(
    context: ExecuteFundAndActionExecutionTaskContext<Extract<FundAndActionExecutionTask, { kind: "submitFunding" }>>
  ): MaybePromise<FundAndActionExecutionEvent>;
  pollFundingResult(
    context: ExecuteFundAndActionExecutionTaskContext<
      Extract<FundAndActionExecutionTask, { kind: "pollFundingResult" }>
    >
  ): MaybePromise<FundAndActionExecutionEvent | undefined>;
}

export interface FundAndActionFollowUpExecutorAdapter {
  submitFollowUp(
    context: ExecuteFundAndActionExecutionTaskContext<Extract<FundAndActionExecutionTask, { kind: "submitFollowUp" }>>
  ): MaybePromise<FundAndActionExecutionEvent>;
  pollFollowUpResult(
    context: ExecuteFundAndActionExecutionTaskContext<
      Extract<FundAndActionExecutionTask, { kind: "pollFollowUpResult" }>
    >
  ): MaybePromise<FundAndActionExecutionEvent | undefined>;
}

export interface ExecuteFundAndActionExecutionTaskInput {
  session: FundAndActionExecutionSession;
  adapters: {
    funding?: FundAndActionFundingExecutorAdapter;
    followUp?: FundAndActionFollowUpExecutorAdapter;
  };
}

export interface ExecuteFundAndActionExecutionTaskOutput {
  result: {
    session: FundAndActionExecutionSession;
    task: FundAndActionExecutionTask;
    event?: FundAndActionExecutionEvent;
  };
}

export type FundAndActionDriverErrorCode =
  | "INVALID_EXECUTION_TASK"
  | "MISSING_FUNDING_ADAPTER"
  | "MISSING_FOLLOW_UP_ADAPTER"
  | "TASK_REQUIRES_EVENT"
  | "INVALID_TASK_EVENT";

export class FundAndActionDriverError extends ErcMandatedSdkError {
  readonly code: FundAndActionDriverErrorCode;
  readonly field: "task.kind" | "adapters.funding" | "adapters.followUp" | "event.type";

  constructor(
    message: string,
    params: {
      code: FundAndActionDriverErrorCode;
      field: "task.kind" | "adapters.funding" | "adapters.followUp" | "event.type";
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "FundAndActionDriverError",
      details: {
        field: params.field,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

function assertFundingPlan(session: FundAndActionExecutionSession): FundingPlan {
  if (session.fundAndActionPlan.fundingPlan) {
    return session.fundAndActionPlan.fundingPlan;
  }

  throw new FundAndActionDriverError("Funding task requires fundingPlan in session.", {
    code: "INVALID_EXECUTION_TASK",
    field: "task.kind",
    details: {
      status: session.status,
      taskKind: session.fundingStep.status
    }
  });
}

function resolveTaskSummary(session: FundAndActionExecutionSession, kind: FundAndActionExecutionTask["kind"]): string {
  switch (kind) {
    case "submitFunding":
    case "pollFundingResult":
      return session.fundingStep.summary;
    case "submitFollowUp":
    case "pollFollowUpResult":
    case "completed":
      return session.fundingStep.status === "failed" ? session.fundingStep.summary : session.followUpStep.summary;
  }
}

function isAllowedEventForTask(taskKind: FundAndActionExecutionTask["kind"], eventType: FundAndActionExecutionEvent["type"]): boolean {
  switch (taskKind) {
    case "submitFunding":
    case "pollFundingResult":
      return (
        eventType === "fundingSubmitted" ||
        eventType === "fundingConfirmed" ||
        eventType === "fundingFailed"
      );
    case "submitFollowUp":
    case "pollFollowUpResult":
      return eventType === "followUpSubmitted" || eventType === "followUpResultReceived";
    case "completed":
      return false;
  }
}

export function resolveFundAndActionExecutionTask(
  input: ResolveFundAndActionExecutionTaskInput
): ResolveFundAndActionExecutionTaskOutput {
  const session = normalizeFundAndActionExecutionSession({
    session: input.session
  }).result.session;

  switch (session.status) {
    case "pendingFunding":
      return {
        result: {
          session,
          task:
            session.fundingStep.status === "pending"
              ? {
                  kind: "submitFunding",
                  summary: resolveTaskSummary(session, "submitFunding"),
                  fundingPlan: assertFundingPlan(session)
                }
              : {
                  kind: "pollFundingResult",
                  summary: resolveTaskSummary(session, "pollFundingResult"),
                  assetTransferResult: session.fundingStep.result!
                }
        }
      };

    case "pendingFollowUp":
      return {
        result: {
          session,
          task:
            session.followUpStep.status === "pending"
              ? {
                  kind: "submitFollowUp",
                  summary: resolveTaskSummary(session, "submitFollowUp"),
                  followUpActionPlan: session.fundAndActionPlan.followUpActionPlan
                }
              : {
                  kind: "pollFollowUpResult",
                  summary: resolveTaskSummary(session, "pollFollowUpResult"),
                  reference: session.followUpStep.reference
                }
        }
      };

    case "succeeded":
    case "failed":
    case "skipped":
      return {
        result: {
          session,
          task: {
            kind: "completed",
            summary: resolveTaskSummary(session, "completed"),
            status: session.status,
            assetTransferResult: session.fundingStep.status === "failed" ? session.fundingStep.result : undefined,
            result: session.followUpStep.result
          }
        }
      };
  }
}

export async function executeFundAndActionExecutionTask(
  input: ExecuteFundAndActionExecutionTaskInput
): Promise<ExecuteFundAndActionExecutionTaskOutput> {
  const { session, task } = resolveFundAndActionExecutionTask({
    session: input.session
  }).result;

  if (task.kind === "completed") {
    return {
      result: {
        session,
        task
      }
    };
  }

  let event: FundAndActionExecutionEvent | undefined;

  switch (task.kind) {
    case "submitFunding": {
      if (!input.adapters.funding) {
        throw new FundAndActionDriverError("submitFunding task requires funding adapter.", {
          code: "MISSING_FUNDING_ADAPTER",
          field: "adapters.funding",
          details: {
            taskKind: task.kind
          }
        });
      }
      event = await input.adapters.funding.submitFunding({ session, task });
      break;
    }

    case "pollFundingResult": {
      if (!input.adapters.funding) {
        throw new FundAndActionDriverError("pollFundingResult task requires funding adapter.", {
          code: "MISSING_FUNDING_ADAPTER",
          field: "adapters.funding",
          details: {
            taskKind: task.kind
          }
        });
      }
      event = await input.adapters.funding.pollFundingResult({ session, task });
      break;
    }

    case "submitFollowUp": {
      if (!input.adapters.followUp) {
        throw new FundAndActionDriverError("submitFollowUp task requires follow-up adapter.", {
          code: "MISSING_FOLLOW_UP_ADAPTER",
          field: "adapters.followUp",
          details: {
            taskKind: task.kind
          }
        });
      }
      event = await input.adapters.followUp.submitFollowUp({ session, task });
      break;
    }

    case "pollFollowUpResult": {
      if (!input.adapters.followUp) {
        throw new FundAndActionDriverError("pollFollowUpResult task requires follow-up adapter.", {
          code: "MISSING_FOLLOW_UP_ADAPTER",
          field: "adapters.followUp",
          details: {
            taskKind: task.kind
          }
        });
      }
      event = await input.adapters.followUp.pollFollowUpResult({ session, task });
      break;
    }
  }

  const requiresEvent = task.kind === "submitFunding" || task.kind === "submitFollowUp";
  if (!event) {
    if (requiresEvent) {
      throw new FundAndActionDriverError("Submission task must return an execution event.", {
        code: "TASK_REQUIRES_EVENT",
        field: "event.type",
        details: {
          taskKind: task.kind
        }
      });
    }

    return {
      result: {
        session,
        task
      }
    };
  }

  if (!isAllowedEventForTask(task.kind, event.type)) {
    throw new FundAndActionDriverError("Execution event is not allowed for resolved task.", {
      code: "INVALID_TASK_EVENT",
      field: "event.type",
      details: {
        taskKind: task.kind,
        eventType: event.type
      }
    });
  }

  const nextSession = applyFundAndActionExecutionEvent({
    session,
    event
  }).result.session;

  return {
    result: {
      session: nextSession,
      task,
      event
    }
  };
}
