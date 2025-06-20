import { type Static, Type } from '@sinclair/typebox';
import { ApiNullResponseSchema } from '../common.schema'; // As per requirement, though not directly used in these schemas
import { CallSettingsSchema, LlmMessageSchema, LlmMessagesSchema, type LlmMessagesSchemaModel } from '../llm/llm.schema';
import type { AreTypesFullyCompatible, ChangePropertyType } from '../typeUtils';
import type { Prompt, PromptGeneratePayloadModel, PromptGenerateResponseModel, PromptPreview } from './prompts.model';

// --- Prompt Options Schema ---
const PromptOptionsSchema = Type.Intersect(
	[
		CallSettingsSchema,
		Type.Object({
			llmId: Type.Optional(Type.String()),
		}),
	],
	{ $id: 'PromptOptions' },
);

// --- Prompt Schema ---
export const PromptSchema = Type.Object(
	{
		id: Type.String(),
		userId: Type.String(),
		parentId: Type.Optional(Type.String()),
		revisionId: Type.Number(),
		name: Type.String(),
		appId: Type.Optional(Type.String()),
		tags: Type.Array(Type.String()),
		messages: LlmMessagesSchema,
		settings: PromptOptionsSchema,
	},
	{ $id: 'Prompt' },
);

// DO NOT CHANGE THIS PART ----
// LlmMessageSchema doesnt exactly map to LlmMessage, but lets assume it does for now
type PromptHack = ChangePropertyType<Prompt, 'messages', LlmMessagesSchemaModel>;
const _PromptCheck: AreTypesFullyCompatible<PromptHack, Static<typeof PromptSchema>> = true;
// -----

// --- PromptPreview Schema ---
const PromptPreviewKeys = ['id', 'userId', 'parentId', 'revisionId', 'name', 'appId', 'tags', 'settings'] as const;
export const PromptPreviewSchema = Type.Pick(PromptSchema, PromptPreviewKeys, { $id: 'PromptPreview' });

const _PromptPreviewCheck: AreTypesFullyCompatible<PromptPreview, Static<typeof PromptPreviewSchema>> = true;

// --- PromptList Schema ---
export const PromptListSchema = Type.Object(
	{
		prompts: Type.Array(PromptPreviewSchema),
		hasMore: Type.Boolean(),
	},
	{ $id: 'PromptList' },
);

// --- API Specific Schemas ---
export const PromptParamsSchema = Type.Object(
	{
		promptId: Type.String(),
	},
	{ $id: 'PromptParams' },
);

export const PromptCreateSchema = Type.Object(
	{
		name: Type.String(),
		messages: LlmMessagesSchema,
		options: PromptOptionsSchema, // Use the new PromptOptionsSchema
		tags: Type.Optional(Type.Array(Type.String())),
		parentId: Type.Optional(Type.String()),
		// appId is usually system-assigned or derived, not part of create payload typically.
		// revisionId is system-assigned.
	},
	{ $id: 'PromptCreate' },
);

export const PromptUpdateSchema = Type.Partial(
	Type.Object({
		name: Type.String(),
		messages: LlmMessagesSchema, // Entire messages array is replaced if provided
		options: PromptOptionsSchema, // Use the new PromptOptionsSchema
		tags: Type.Array(Type.String()), // Entire tags array is replaced if provided
		// parentId, revisionId, appId are generally not updatable via a generic update payload.
	}),
	{ $id: 'PromptUpdate' },
);

export const PromptRevisionParamsSchema = Type.Object(
	{
		promptId: Type.String(),
		revisionId: Type.String(), // revisionId is string in URL params
	},
	{ $id: 'PromptRevisionParams' },
);

// Add near other API Specific Schemas
export const PromptGeneratePayloadSchema = Type.Object(
	{
		options: Type.Optional(PromptOptionsSchema), // Allow overriding prompt's default LLM settings
	},
	{ $id: 'PromptGeneratePayload' },
);

// Add near other API Specific Schemas
export const PromptGenerateResponseSchema = Type.Object(
	{
		generatedMessage: LlmMessageSchema, // The newly generated message
	},
	{ $id: 'PromptGenerateResponse' },
);

export const PromptGenerateFromMessagesPayloadSchema = Type.Object(
	{
		messages: LlmMessagesSchema,
		options: Type.Optional(PromptOptionsSchema),
	},
	{ $id: 'PromptGenerateFromMessagesPayload' },
);

// --- Static Types ---
export type PromptSchemaModel = Static<typeof PromptSchema>;
export type PromptPreviewSchemaModel = Static<typeof PromptPreviewSchema>;
export type PromptParams = Static<typeof PromptParamsSchema>;
export type PromptCreatePayload = Static<typeof PromptCreateSchema>;
export type PromptUpdatePayload = Static<typeof PromptUpdateSchema>;
export type PromptRevisionParams = Static<typeof PromptRevisionParamsSchema>;
export type PromptListSchemaModel = Static<typeof PromptListSchema>;
export type PromptGeneratePayload = Static<typeof PromptGeneratePayloadSchema>;
export type PromptGenerateResponseSchemaModel = Static<typeof PromptGenerateResponseSchema>;
export type PromptGenerateFromMessagesPayload = Static<typeof PromptGenerateFromMessagesPayloadSchema>;

// Add these checks. Ensure PromptGeneratePayloadModel and PromptGenerateResponseModel are imported or defined.

// Define a static type for a single LlmMessage, similar to LlmMessagesSchemaModel for arrays
type SingleLlmMessageSchemaModel = Static<typeof LlmMessageSchema>;

// Hack type for PromptGenerateResponseModel to align with LlmMessageSchema for the check
type PromptGenerateResponseModelHack = ChangePropertyType<PromptGenerateResponseModel, 'generatedMessage', SingleLlmMessageSchemaModel>;

const _PromptGeneratePayloadCheck: AreTypesFullyCompatible<PromptGeneratePayloadModel, Static<typeof PromptGeneratePayloadSchema>> = true;
const _PromptGenerateResponseCheck: AreTypesFullyCompatible<PromptGenerateResponseModelHack, PromptGenerateResponseSchemaModel> = true;
