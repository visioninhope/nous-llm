import { addCost, agentContext } from '#agent/agentContextLocalStorage';
import { appContext } from '#app/applicationContext';
import { callStack } from '#llm/llmCallService/llmCall';
import { logger } from '#o11y/logger';
import { withActiveSpan } from '#o11y/trace';
import type { AgentLLMs } from '#shared/agent/agent.model';
import { type GenerateTextOptions, type GenerationStats, type LLM, type LlmMessage, messageText, system, user } from '#shared/llm/llm.model';
import type { LlmCall } from '#shared/llmCall/llmCall.model';
import { BaseLLM } from '../base-llm';

export class MockLLM extends BaseLLM {
	lastPrompt = '';
	public responses: { response: string; callback?: (prompt: string) => void }[] = [];
	/**
	 * @param id The identifier for the LLM instance.
	 * @param service The service name for the LLM.
	 * @param model The model name for the LLM.
	 * @param maxInputTokens defaults to 100000
	 * @param initialResponses Optional initial responses for the MockLLM instance.
	 */
	constructor(
		id = 'mock',
		service = 'mock',
		model = 'mock',
		maxInputTokens = 100000,
		initialResponses?: { response: string; callback?: (prompt: string) => void }[],
	) {
		super(id, service, model, maxInputTokens, () => ({ inputCost: 0, outputCost: 0, totalCost: 0 }));
		this.responses = initialResponses ?? [];
	}

	reset() {
		this.responses.length = 0;
	}

	setResponse(response: string, callback?: (prompt: string) => void) {
		this.responses = [{ response, callback }];
	}

	setResponses(responses: { response: string; callback?: (prompt: string) => void }[]) {
		this.responses = responses;
	}

	addResponse(response: string, callback?: (prompt: string) => void) {
		this.responses.push({ response, callback });
	}

	getLastPrompt(): string {
		if (!this.lastPrompt) throw new Error('No calls yet');
		return this.lastPrompt;
	}

	protected async _generateMessage(messages: ReadonlyArray<LlmMessage>, opts?: GenerateTextOptions): Promise<LlmMessage> {
		const description = opts?.id ?? '';
		logger.info(`MockLLM ${description} processing ${messages.length} messages.`);

		return withActiveSpan(`generateMessage ${description}`, async (span) => {
			// Use the full message array for context, but might use last message for specific logic like callback
			const fullPromptText = messages.map((m) => messageText(m)).join('\n');
			const lastUserMessage = messages.findLast((m) => m.role === 'user');
			const userPromptForCallback = lastUserMessage ? messageText(lastUserMessage) : ''; // Use last user message for callback consistency

			this.lastPrompt = userPromptForCallback; // Keep track of the last user prompt for testing

			if (this.responses.length === 0) {
				throw new Error(`Need to call setResponses on MockLLM before calling generate for prompt id:${description} prompt:${userPromptForCallback}`);
			}

			const llmCallSave: Promise<LlmCall> = appContext().llmCallService.saveRequest({
				messages: messages as LlmMessage[], // Cast needed as input is ReadonlyArray
				llmId: this.getId(),
				agentId: agentContext()?.agentId,
				callStack: callStack(),
				description,
				settings: opts,
			});
			const requestTime = Date.now();

			// Simulate the LLM call
			const { response: responseText, callback } = this.responses.shift()!;

			if (callback) callback(userPromptForCallback);

			const timeToFirstToken = 1; // Mock value
			const finishTime = Date.now();
			const llmCall: LlmCall = await llmCallSave;

			const inputTokens = await this.countTokens(fullPromptText);
			const outputTokens = await this.countTokens(responseText);
			const { totalCost } = this.calculateCosts(inputTokens, outputTokens);
			const cost = totalCost; // Will be 0 for MockLLM
			addCost(cost);

			llmCall.timeToFirstToken = timeToFirstToken;
			llmCall.totalTime = finishTime - requestTime;
			llmCall.cost = cost;
			llmCall.inputTokens = inputTokens;
			llmCall.outputTokens = outputTokens;

			const stats: GenerationStats = {
				llmId: this.getId(),
				cost,
				inputTokens,
				outputTokens,
				requestTime,
				timeToFirstToken,
				totalTime: llmCall.totalTime,
			};

			const assistantMessage: LlmMessage = {
				role: 'assistant',
				content: responseText,
				stats,
			};

			// Update the call log with the response
			llmCall.messages = [...llmCall.messages, assistantMessage];

			span.setAttributes({
				inputChars: fullPromptText.length,
				outputChars: responseText.length,
				inputTokens,
				outputTokens,
				cost,
				model: this.model,
				service: this.service,
				description,
			});

			try {
				await appContext().llmCallService.saveResponse(llmCall);
			} catch (e) {
				logger.error(e, 'Failed to save MockLLM response');
			}

			// logger.debug(`MockLLM response ${responseText}`);
			return assistantMessage;
		});
	}

	// @logTextGeneration
	async _generateText(systemPrompt: string | undefined, userPrompt: string, opts?: GenerateTextOptions): Promise<string> {
		const messages: LlmMessage[] = [];
		if (systemPrompt) messages.push(system(systemPrompt));
		messages.push(user(userPrompt));

		// Delegate the core logic to _generateMessage
		const resultMessage = await this._generateMessage(messages, opts);

		// Extract the text content
		return messageText(resultMessage);
	}
}

export const mockLLM = new MockLLM();

export function mockLLMRegistry(): Record<string, () => LLM> {
	return {
		// Tests need the same instance returned
		'mock:mock': () => mockLLM,
	};
}

export function mockLLMs(): AgentLLMs {
	return {
		easy: mockLLM,
		medium: mockLLM,
		hard: mockLLM,
		xhard: mockLLM,
	};
}
