import { ErcMandatedSdkError } from "./errors.js";
import type { FundAndActionPlanOutput } from "./fundAndAction.js";
import {
  type FollowUpActionExecutionError,
  type FollowUpActionExecutionReference,
  type FollowUpActionResult,
  buildFollowUpActionPlan
} from "./followUpAction.js";

export type FundAndActionExecutionSessionStatus =
  | "pendingFunding"
  | "pendingFollowUp"
  | "succeeded"
  | "failed"
  | "skipped";

export type FundAndActionExecutionCurrentStep = "fundTargetAccount" | "followUpAction" | "none";

export type FundAndActionFundingStepStatus = "pending" | "submitted" | "succeeded" | "failed" | "skipped";

export type FundAndActionFollowUpStepStatus = "pending" | "submitted" | "succeeded" | "failed" | "skipped";

export interface FundAndActionFundingStepExecution {
  required: boolean;
  status: FundAndActionFundingStepStatus;
  summary: string;
  updatedAt: string;
  reference?: FollowUpActionExecutionReference;
  error?: FollowUpActionExecutionError;
}

export interface FundAndActionFollowUpStepExecution {
  status: FundAndActionFollowUpStepStatus;
  summary: string;
  updatedAt: string;
  reference?: FollowUpActionExecutionReference;
  result?: FollowUpActionResult;
}

export interface FundAndActionExecutionSession {
  sessionId: string;
  status: FundAndActionExecutionSessionStatus;
  currentStep: FundAndActionExecutionCurrentStep;
  createdAt: string;
  updatedAt: string;
  fundAndActionPlan: FundAndActionPlanOutput["result"];
  fundingStep: FundAndActionFundingStepExecution;
  followUpStep: FundAndActionFollowUpStepExecution;
}

export interface CreateFundAndActionExecutionSessionInput {
  fundAndActionPlan: FundAndActionPlanOutput["result"];
  sessionId?: string;
  createdAt?: string;
}

export interface CreateFundAndActionExecutionSessionOutput {
  result: {
    session: FundAndActionExecutionSession;
  };
}

export type FundAndActionExecutionEvent =
  | {
      type: "fundingSubmitted";
      updatedAt?: string;
      reference: FollowUpActionExecutionReference;
    }
  | {
      type: "fundingConfirmed";
      updatedAt?: string;
      reference?: FollowUpActionExecutionReference;
    }
  | {
      type: "fundingFailed";
      updatedAt?: string;
      reference?: FollowUpActionExecutionReference;
      error: FollowUpActionExecutionError;
    }
  | {
      type: "followUpSubmitted";
      updatedAt?: string;
      reference?: FollowUpActionExecutionReference;
    }
  | {
      type: "followUpResultReceived";
      followUpActionResult: FollowUpActionResult;
    };

export interface ApplyFundAndActionExecutionEventInput {
  session: FundAndActionExecutionSession;
  event: FundAndActionExecutionEvent;
}

export interface ApplyFundAndActionExecutionEventOutput {
  result: {
    session: FundAndActionExecutionSession;
  };
}

export type FundAndActionSessionErrorCode =
  | "INVALID_SESSION_ID"
  | "INVALID_SESSION_TIMESTAMP"
  | "INVALID_SESSION_STATUS"
  | "INVALID_CURRENT_STEP"
  | "INVALID_FUNDING_STEP_STATUS"
  | "INVALID_FOLLOW_UP_STEP_STATUS"
  | "INVALID_SESSION_STATE"
  | "INVALID_EVENT_TYPE"
  | "INVALID_EVENT_TRANSITION"
  | "TERMINAL_SESSION"
  | "MISSING_FUNDING_PLAN"
  | "FOLLOW_UP_RESULT_MISMATCH";

export class FundAndActionSessionError extends ErcMandatedSdkError {
  readonly code: FundAndActionSessionErrorCode;
  readonly field:
    | "sessionId"
    | "createdAt"
    | "updatedAt"
    | "status"
    | "currentStep"
    | "fundingStep.required"
    | "fundingStep.status"
    | "fundingStep.updatedAt"
    | "followUpStep.status"
    | "followUpStep.updatedAt"
    | "followUpStep.result"
    | "event.type"
    | "event.reference"
    | "event.error"
    | "event.followUpActionResult";

  constructor(
    message: string,
    params: {
      code: FundAndActionSessionErrorCode;
      field:
        | "sessionId"
        | "createdAt"
        | "updatedAt"
        | "status"
        | "currentStep"
        | "fundingStep.required"
        | "fundingStep.status"
        | "fundingStep.updatedAt"
        | "followUpStep.status"
        | "followUpStep.updatedAt"
        | "followUpStep.result"
        | "event.type"
        | "event.reference"
        | "event.error"
        | "event.followUpActionResult";
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "FundAndActionSessionError",
      details: {
        field: params.field,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

function normalizeIsoTimestamp(
  value: string | undefined,
  field: "createdAt" | "updatedAt"
): string {
  const timestamp = value ?? new Date().toISOString();

  if (!Number.isNaN(Date.parse(timestamp))) {
    return timestamp;
  }

  throw new FundAndActionSessionError("Invalid ISO datetime string for fund-and-action session.", {
    code: "INVALID_SESSION_TIMESTAMP",
    field,
    details: { value: timestamp }
  });
}

function normalizeSessionId(sessionId: string | undefined, createdAt: string): string {
  if (sessionId === undefined) {
    return `fund-and-action-${Date.parse(createdAt)}`;
  }

  if (typeof sessionId === "string" && sessionId.trim().length > 0) {
    return sessionId;
  }

  throw new FundAndActionSessionError("Invalid sessionId: expected non-empty string.", {
    code: "INVALID_SESSION_ID",
    field: "sessionId",
    details: { sessionId }
  });
}

function normalizeSessionStatus(status: string): FundAndActionExecutionSessionStatus {
  if (
    status === "pendingFunding" ||
    status === "pendingFollowUp" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "skipped"
  ) {
    return status;
  }

  throw new FundAndActionSessionError("Invalid fund-and-action session status.", {
    code: "INVALID_SESSION_STATUS",
    field: "status",
    details: { status }
  });
}

function normalizeCurrentStep(currentStep: string): FundAndActionExecutionCurrentStep {
  if (currentStep === "fundTargetAccount" || currentStep === "followUpAction" || currentStep === "none") {
    return currentStep;
  }

  throw new FundAndActionSessionError("Invalid currentStep in fund-and-action session.", {
    code: "INVALID_CURRENT_STEP",
    field: "currentStep",
    details: { currentStep }
  });
}

function normalizeFundingStepStatus(status: string): FundAndActionFundingStepStatus {
  if (
    status === "pending" ||
    status === "submitted" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "skipped"
  ) {
    return status;
  }

  throw new FundAndActionSessionError("Invalid fundingStep.status in fund-and-action session.", {
    code: "INVALID_FUNDING_STEP_STATUS",
    field: "fundingStep.status",
    details: { status }
  });
}

function normalizeFollowUpStepStatus(status: string): FundAndActionFollowUpStepStatus {
  if (
    status === "pending" ||
    status === "submitted" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "skipped"
  ) {
    return status;
  }

  throw new FundAndActionSessionError("Invalid followUpStep.status in fund-and-action session.", {
    code: "INVALID_FOLLOW_UP_STEP_STATUS",
    field: "followUpStep.status",
    details: { status }
  });
}

function normalizePlan(plan: FundAndActionPlanOutput["result"]): FundAndActionPlanOutput["result"] {
  const followUpActionPlan = buildFollowUpActionPlan(plan.followUpAction);

  if (plan.fundingRequired && !plan.fundingPlan) {
    throw new FundAndActionSessionError("fundingRequired plan must include fundingPlan.", {
      code: "MISSING_FUNDING_PLAN",
      field: "status",
      details: {
        fundingRequired: plan.fundingRequired
      }
    });
  }

  return {
    ...plan,
    followUpActionPlan
  };
}

function buildFundingSummary(plan: FundAndActionPlanOutput["result"]): string {
  return plan.steps.find((step) => step.kind === "fundTargetAccount")?.summary ?? "Fund target account.";
}

function buildFollowUpSummary(plan: FundAndActionPlanOutput["result"]): string {
  return plan.followUpActionPlan.summary;
}

function normalizeReference(
  reference: FollowUpActionExecutionReference | undefined
): FollowUpActionExecutionReference | undefined {
  if (!reference) {
    return undefined;
  }

  if (
    reference.type !== "requestId" &&
    reference.type !== "orderId" &&
    reference.type !== "txHash" &&
    reference.type !== "custom"
  ) {
    throw new FundAndActionSessionError("Invalid event reference type.", {
      code: "INVALID_EVENT_TRANSITION",
      field: "event.reference",
      details: { reference }
    });
  }

  if (typeof reference.value !== "string" || reference.value.trim().length === 0) {
    throw new FundAndActionSessionError("Invalid event reference value.", {
      code: "INVALID_EVENT_TRANSITION",
      field: "event.reference",
      details: { reference }
    });
  }

  return {
    type: reference.type,
    value: reference.value
  };
}

function normalizeError(error: FollowUpActionExecutionError | undefined): FollowUpActionExecutionError | undefined {
  if (!error) {
    return undefined;
  }

  if (typeof error.code !== "string" || error.code.trim().length === 0) {
    throw new FundAndActionSessionError("Invalid event error.code.", {
      code: "INVALID_EVENT_TRANSITION",
      field: "event.error",
      details: { error }
    });
  }

  if (typeof error.message !== "string" || error.message.trim().length === 0) {
    throw new FundAndActionSessionError("Invalid event error.message.", {
      code: "INVALID_EVENT_TRANSITION",
      field: "event.error",
      details: { error }
    });
  }

  return {
    code: error.code,
    message: error.message,
    ...(error.retriable !== undefined ? { retriable: error.retriable } : {}),
    ...(error.details ? { details: error.details } : {})
  };
}

function assertSessionInvariant(
  condition: boolean,
  field:
    | "status"
    | "currentStep"
    | "fundingStep.required"
    | "fundingStep.status"
    | "followUpStep.status"
    | "followUpStep.result",
  message: string,
  details: Record<string, unknown>
): void {
  if (condition) {
    return;
  }

  throw new FundAndActionSessionError(message, {
    code: "INVALID_SESSION_STATE",
    field,
    details
  });
}

function ensureSessionMutable(session: FundAndActionExecutionSession): void {
  if (session.status === "succeeded" || session.status === "failed" || session.status === "skipped") {
    throw new FundAndActionSessionError("Terminal fund-and-action session cannot accept new events.", {
      code: "TERMINAL_SESSION",
      field: "status",
      details: {
        status: session.status
      }
    });
  }
}

function normalizeSession(session: FundAndActionExecutionSession): FundAndActionExecutionSession {
  const createdAt = normalizeIsoTimestamp(session.createdAt, "createdAt");
  const normalized: FundAndActionExecutionSession = {
    ...session,
    sessionId: normalizeSessionId(session.sessionId, createdAt),
    status: normalizeSessionStatus(session.status),
    currentStep: normalizeCurrentStep(session.currentStep),
    createdAt,
    updatedAt: normalizeIsoTimestamp(session.updatedAt, "updatedAt"),
    fundAndActionPlan: normalizePlan(session.fundAndActionPlan),
    fundingStep: {
      ...session.fundingStep,
      required: session.fundingStep.required,
      status: normalizeFundingStepStatus(session.fundingStep.status),
      updatedAt: normalizeIsoTimestamp(session.fundingStep.updatedAt, "updatedAt"),
      ...(session.fundingStep.reference
        ? { reference: normalizeReference(session.fundingStep.reference) }
        : {}),
      ...(session.fundingStep.error ? { error: normalizeError(session.fundingStep.error) } : {})
    },
    followUpStep: {
      ...session.followUpStep,
      status: normalizeFollowUpStepStatus(session.followUpStep.status),
      updatedAt: normalizeIsoTimestamp(session.followUpStep.updatedAt, "updatedAt"),
      ...(session.followUpStep.reference
        ? { reference: normalizeReference(session.followUpStep.reference) }
        : {}),
      ...(session.followUpStep.result ? { result: session.followUpStep.result } : {})
    }
  };

  if (typeof normalized.fundingStep.required !== "boolean") {
    throw new FundAndActionSessionError("Invalid fundingStep.required in fund-and-action session.", {
      code: "INVALID_SESSION_STATE",
      field: "fundingStep.required",
      details: {
        required: normalized.fundingStep.required
      }
    });
  }

  validateSessionState(normalized);

  return normalized;
}

function validateSessionState(session: FundAndActionExecutionSession): void {
  switch (session.status) {
    case "pendingFunding":
      assertSessionInvariant(
        session.currentStep === "fundTargetAccount",
        "currentStep",
        "pendingFunding session must stay on fundTargetAccount step.",
        {
          status: session.status,
          currentStep: session.currentStep
        }
      );
      assertSessionInvariant(
        session.fundingStep.required,
        "fundingStep.required",
        "pendingFunding session requires fundingStep.required=true.",
        {
          status: session.status,
          required: session.fundingStep.required
        }
      );
      assertSessionInvariant(
        session.fundingStep.status === "pending" || session.fundingStep.status === "submitted",
        "fundingStep.status",
        "pendingFunding session requires fundingStep.status pending or submitted.",
        {
          status: session.status,
          fundingStepStatus: session.fundingStep.status
        }
      );
      assertSessionInvariant(
        session.followUpStep.status === "pending" && session.followUpStep.result === undefined,
        "followUpStep.status",
        "pendingFunding session cannot advance followUpStep before funding completes.",
        {
          status: session.status,
          followUpStepStatus: session.followUpStep.status,
          hasFollowUpResult: session.followUpStep.result !== undefined
        }
      );
      return;

    case "pendingFollowUp":
      assertSessionInvariant(
        session.currentStep === "followUpAction",
        "currentStep",
        "pendingFollowUp session must stay on followUpAction step.",
        {
          status: session.status,
          currentStep: session.currentStep
        }
      );
      assertSessionInvariant(
        session.fundingStep.status === "succeeded" || session.fundingStep.status === "skipped",
        "fundingStep.status",
        "pendingFollowUp session requires fundingStep.status succeeded or skipped.",
        {
          status: session.status,
          fundingStepStatus: session.fundingStep.status
        }
      );
      assertSessionInvariant(
        session.fundingStep.status === "skipped"
          ? session.fundingStep.required === false
          : session.fundingStep.required === true,
        "fundingStep.required",
        "pendingFollowUp session fundingStep.required must align with fundingStep.status.",
        {
          status: session.status,
          fundingStepStatus: session.fundingStep.status,
          required: session.fundingStep.required
        }
      );
      assertSessionInvariant(
        session.followUpStep.status === "pending" || session.followUpStep.status === "submitted",
        "followUpStep.status",
        "pendingFollowUp session requires followUpStep.status pending or submitted.",
        {
          status: session.status,
          followUpStepStatus: session.followUpStep.status
        }
      );
      assertSessionInvariant(
        session.followUpStep.result === undefined,
        "followUpStep.result",
        "pendingFollowUp session cannot already contain terminal follow-up result.",
        {
          status: session.status,
          followUpStepStatus: session.followUpStep.status
        }
      );
      return;

    case "succeeded":
    case "skipped":
      assertSessionInvariant(
        session.currentStep === "none",
        "currentStep",
        "Terminal follow-up session must set currentStep to none.",
        {
          status: session.status,
          currentStep: session.currentStep
        }
      );
      assertSessionInvariant(
        session.followUpStep.status === session.status,
        "followUpStep.status",
        "Terminal follow-up session requires followUpStep.status to match session.status.",
        {
          status: session.status,
          followUpStepStatus: session.followUpStep.status
        }
      );
      assertSessionInvariant(
        session.followUpStep.result?.status === session.status,
        "followUpStep.result",
        "Terminal follow-up session requires matching followUpStep.result.",
        {
          status: session.status,
          resultStatus: session.followUpStep.result?.status
        }
      );
      validateFollowUpResultMatchesSession(session, session.followUpStep.result!);
      return;

    case "failed": {
      assertSessionInvariant(
        session.currentStep === "none",
        "currentStep",
        "Failed session must set currentStep to none.",
        {
          status: session.status,
          currentStep: session.currentStep
        }
      );

      const fundingFailed = session.fundingStep.status === "failed";
      const followUpFailed = session.followUpStep.status === "failed";

      assertSessionInvariant(
        fundingFailed || followUpFailed,
        "status",
        "Failed session must fail in fundingStep or followUpStep.",
        {
          fundingStepStatus: session.fundingStep.status,
          followUpStepStatus: session.followUpStep.status
        }
      );

      if (fundingFailed) {
        assertSessionInvariant(
          session.fundingStep.error !== undefined,
          "fundingStep.status",
          "Failed fundingStep must include error details.",
          {
            status: session.status
          }
        );
        assertSessionInvariant(
          session.followUpStep.status === "pending" && session.followUpStep.result === undefined,
          "followUpStep.status",
          "Funding failure must leave followUpStep pending without result.",
          {
            followUpStepStatus: session.followUpStep.status,
            hasFollowUpResult: session.followUpStep.result !== undefined
          }
        );
        return;
      }

      assertSessionInvariant(
        session.fundingStep.status === "succeeded" || session.fundingStep.status === "skipped",
        "fundingStep.status",
        "Follow-up failure requires fundingStep to be succeeded or skipped.",
        {
          fundingStepStatus: session.fundingStep.status
        }
      );
      assertSessionInvariant(
        session.followUpStep.result?.status === "failed",
        "followUpStep.result",
        "Failed followUpStep must include terminal failed result.",
        {
          followUpStepStatus: session.followUpStep.status,
          resultStatus: session.followUpStep.result?.status
        }
      );
      validateFollowUpResultMatchesSession(session, session.followUpStep.result!);
      return;
    }
  };
}

function validateFollowUpResultMatchesSession(
  session: FundAndActionExecutionSession,
  followUpActionResult: FollowUpActionResult
): void {
  if (
    followUpActionResult.kind !== session.fundAndActionPlan.followUpActionPlan.kind ||
    followUpActionResult.executionMode !== session.fundAndActionPlan.followUpActionPlan.executionMode ||
    followUpActionResult.target !== session.fundAndActionPlan.followUpActionPlan.target
  ) {
    throw new FundAndActionSessionError("followUpActionResult does not match session follow-up plan.", {
      code: "FOLLOW_UP_RESULT_MISMATCH",
      field: "event.followUpActionResult",
      details: {
        resultKind: followUpActionResult.kind,
        planKind: session.fundAndActionPlan.followUpActionPlan.kind,
        resultExecutionMode: followUpActionResult.executionMode,
        planExecutionMode: session.fundAndActionPlan.followUpActionPlan.executionMode,
        resultTarget: followUpActionResult.target,
        planTarget: session.fundAndActionPlan.followUpActionPlan.target
      }
    });
  }
}

export function createFundAndActionExecutionSession(
  input: CreateFundAndActionExecutionSessionInput
): CreateFundAndActionExecutionSessionOutput {
  const createdAt = normalizeIsoTimestamp(input.createdAt, "createdAt");
  const plan = normalizePlan(input.fundAndActionPlan);
  const sessionId = normalizeSessionId(input.sessionId, createdAt);
  const fundingRequired = plan.fundingRequired;

  return {
    result: {
      session: {
        sessionId,
        status: fundingRequired ? "pendingFunding" : "pendingFollowUp",
        currentStep: fundingRequired ? "fundTargetAccount" : "followUpAction",
        createdAt,
        updatedAt: createdAt,
        fundAndActionPlan: plan,
        fundingStep: {
          required: fundingRequired,
          status: fundingRequired ? "pending" : "skipped",
          summary: buildFundingSummary(plan),
          updatedAt: createdAt
        },
        followUpStep: {
          status: "pending",
          summary: buildFollowUpSummary(plan),
          updatedAt: createdAt
        }
      }
    }
  };
}

export function applyFundAndActionExecutionEvent(
  input: ApplyFundAndActionExecutionEventInput
): ApplyFundAndActionExecutionEventOutput {
  const session = normalizeSession(input.session);
  ensureSessionMutable(session);

  switch (input.event.type) {
    case "fundingSubmitted": {
      if (session.status !== "pendingFunding") {
        throw new FundAndActionSessionError("fundingSubmitted is only valid while funding is pending.", {
          code: "INVALID_EVENT_TRANSITION",
          field: "event.type",
          details: {
            status: session.status,
            eventType: input.event.type
          }
        });
      }

      const updatedAt = normalizeIsoTimestamp(input.event.updatedAt, "updatedAt");

      return {
        result: {
          session: {
            ...session,
            updatedAt,
            fundingStep: {
              ...session.fundingStep,
              status: "submitted",
              updatedAt,
              reference: normalizeReference(input.event.reference)
            }
          }
        }
      };
    }

    case "fundingConfirmed": {
      if (session.status !== "pendingFunding") {
        throw new FundAndActionSessionError("fundingConfirmed is only valid while funding is pending.", {
          code: "INVALID_EVENT_TRANSITION",
          field: "event.type",
          details: {
            status: session.status,
            eventType: input.event.type
          }
        });
      }

      const updatedAt = normalizeIsoTimestamp(input.event.updatedAt, "updatedAt");

      return {
        result: {
          session: {
            ...session,
            status: "pendingFollowUp",
            currentStep: "followUpAction",
            updatedAt,
            fundingStep: {
              ...session.fundingStep,
              status: "succeeded",
              updatedAt,
              ...(input.event.reference ? { reference: normalizeReference(input.event.reference) } : {})
            },
            followUpStep: {
              ...session.followUpStep,
              updatedAt
            }
          }
        }
      };
    }

    case "fundingFailed": {
      if (session.status !== "pendingFunding") {
        throw new FundAndActionSessionError("fundingFailed is only valid while funding is pending.", {
          code: "INVALID_EVENT_TRANSITION",
          field: "event.type",
          details: {
            status: session.status,
            eventType: input.event.type
          }
        });
      }

      const updatedAt = normalizeIsoTimestamp(input.event.updatedAt, "updatedAt");

      return {
        result: {
          session: {
            ...session,
            status: "failed",
            currentStep: "none",
            updatedAt,
            fundingStep: {
              ...session.fundingStep,
              status: "failed",
              updatedAt,
              ...(input.event.reference ? { reference: normalizeReference(input.event.reference) } : {}),
              error: normalizeError(input.event.error)
            }
          }
        }
      };
    }

    case "followUpSubmitted": {
      if (session.status !== "pendingFollowUp") {
        throw new FundAndActionSessionError("followUpSubmitted is only valid while follow-up is pending.", {
          code: "INVALID_EVENT_TRANSITION",
          field: "event.type",
          details: {
            status: session.status,
            eventType: input.event.type
          }
        });
      }

      const updatedAt = normalizeIsoTimestamp(input.event.updatedAt, "updatedAt");

      return {
        result: {
          session: {
            ...session,
            updatedAt,
            followUpStep: {
              ...session.followUpStep,
              status: "submitted",
              updatedAt,
              ...(input.event.reference ? { reference: normalizeReference(input.event.reference) } : {})
            }
          }
        }
      };
    }

    case "followUpResultReceived": {
      if (session.status !== "pendingFollowUp") {
        throw new FundAndActionSessionError("followUpResultReceived is only valid while follow-up is pending.", {
          code: "INVALID_EVENT_TRANSITION",
          field: "event.type",
          details: {
            status: session.status,
            eventType: input.event.type
          }
        });
      }

      validateFollowUpResultMatchesSession(session, input.event.followUpActionResult);

      if (
        input.event.followUpActionResult.status !== "succeeded" &&
        input.event.followUpActionResult.status !== "failed" &&
        input.event.followUpActionResult.status !== "skipped"
      ) {
        throw new FundAndActionSessionError("followUpResultReceived requires terminal follow-up result.", {
          code: "INVALID_EVENT_TRANSITION",
          field: "event.followUpActionResult",
          details: {
            status: input.event.followUpActionResult.status
          }
        });
      }

      const updatedAt = normalizeIsoTimestamp(input.event.followUpActionResult.updatedAt, "updatedAt");
      const sessionStatus: FundAndActionExecutionSessionStatus =
        input.event.followUpActionResult.status === "succeeded"
          ? "succeeded"
          : input.event.followUpActionResult.status === "failed"
            ? "failed"
            : "skipped";

      return {
        result: {
          session: {
            ...session,
            status: sessionStatus,
            currentStep: "none",
            updatedAt,
            followUpStep: {
              ...session.followUpStep,
              status: input.event.followUpActionResult.status,
              updatedAt,
              ...(input.event.followUpActionResult.reference
                ? { reference: normalizeReference(input.event.followUpActionResult.reference) }
                : {}),
              result: input.event.followUpActionResult
            }
          }
        }
      };
    }

    default:
      throw new FundAndActionSessionError("Unsupported fund-and-action execution event.", {
        code: "INVALID_EVENT_TYPE",
        field: "event.type",
        details: {
          event: input.event
        }
      });
  }
}
