// TypeBox schema for the submit_plan tool.
// This defines what the agent must produce.

import { Type } from "@sinclair/typebox";

const DependencyUpdateSchema = Type.Object(
  {
    package: Type.String({ minLength: 1 }),
    from: Type.String({ minLength: 1 }),
    to: Type.String({ minLength: 1 }),
    update_type: Type.Union([
      Type.Literal("patch"),
      Type.Literal("minor"),
      Type.Literal("major"),
      Type.Literal("security"),
    ]),
    changelog_url: Type.Optional(Type.String()),
    breaking_changes: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const RepoContextSchema = Type.Object(
  {
    platform: Type.Union([Type.Literal("gitlab"), Type.Literal("github")]),
    ecosystems: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    test_command: Type.String({ minLength: 1 }),
    default_branch: Type.String({ minLength: 1 }),
    lock_files: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

const CreateMrActionSchema = Type.Object(
  {
    type: Type.Literal("create_mr"),
    branch: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    updates: Type.Array(DependencyUpdateSchema, { minItems: 1 }),
    commands: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    test_command: Type.String({ minLength: 1 }),
    labels: Type.Array(Type.String()),
    fallback_strategy: Type.Union([
      Type.Literal("batch"),
      Type.Literal("individual_on_failure"),
      Type.Literal("individual"),
    ]),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    working_dir: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const UpdateMrActionSchema = Type.Object(
  {
    type: Type.Literal("update_mr"),
    mr_id: Type.Integer({ minimum: 1 }),
    branch: Type.String({ minLength: 1 }),
    rebase_first: Type.Boolean(),
    updates: Type.Array(DependencyUpdateSchema, { minItems: 1 }),
    commands: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    test_command: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    labels: Type.Array(Type.String()),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    working_dir: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const CreateIssueActionSchema = Type.Object(
  {
    type: Type.Literal("create_issue"),
    title: Type.String({ minLength: 1 }),
    body: Type.String({ minLength: 1 }),
    labels: Type.Array(Type.String()),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

const CommentIssueActionSchema = Type.Object(
  {
    type: Type.Literal("comment_issue"),
    issue_id: Type.Integer({ minimum: 1 }),
    body: Type.String({ minLength: 1 }),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

const CommentMrActionSchema = Type.Object(
  {
    type: Type.Literal("comment_mr"),
    mr_id: Type.Integer({ minimum: 1 }),
    body: Type.String({ minLength: 1 }),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

const CloseMrActionSchema = Type.Object(
  {
    type: Type.Literal("close_mr"),
    mr_id: Type.Integer({ minimum: 1 }),
    comment: Type.String({ minLength: 1 }),
    delete_branch: Type.Boolean(),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

const SkipActionSchema = Type.Object(
  {
    type: Type.Literal("skip"),
    package: Type.String({ minLength: 1 }),
    reason: Type.String({ minLength: 1 }),
    reason_type: Type.Union([
      Type.Literal("human_hold"),
      Type.Literal("recently_updated"),
      Type.Literal("no_update_available"),
      Type.Literal("pinned"),
    ]),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

const ActionSchema = Type.Union([
  CreateMrActionSchema,
  UpdateMrActionSchema,
  CreateIssueActionSchema,
  CommentIssueActionSchema,
  CommentMrActionSchema,
  CloseMrActionSchema,
  SkipActionSchema,
]);

export const SUBMIT_PLAN_SCHEMA = Type.Object(
  {
    repo_context: RepoContextSchema,
    actions: Type.Array(ActionSchema, { maxItems: 20 }),
  },
  { additionalProperties: false },
);
