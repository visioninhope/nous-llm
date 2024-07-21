import { AgentLLMs, addCost, agentContext } from '#agent/agentContext';
import { CallerId } from '#llm/llmCallService/llmCallService';
import { CreateLlmResponse } from '#llm/llmCallService/llmRequestResponse';
import { logger } from '#o11y/logger';
import { withActiveSpan } from '#o11y/trace';
import { appContext } from '../../app';
import { BaseLLM } from '../base-llm';
import { GenerateTextOptions, combinePrompts, logTextGeneration } from '../llm';

export function mockLLMs(): AgentLLMs {
	return {
		easy: new MockLLM(),
		medium: new MockLLM(),
		hard: new MockLLM(),
		xhard: new MockLLM(),
	};
}

export class MockLLM extends BaseLLM {
	lastPrompt = '';
	private responses: { response: string; callback?: (prompt: string) => void }[] = [];
	/**
	 * @param maxInputTokens defaults to 100000
	 */
	constructor(
		maxInputTokens = 100000,
	) {
		super(
			'mock',
			'mock',
			'mock',
			maxInputTokens,
			(input: string) => (input.length * 1) / 1_000_000,
			(output: string) => (output.length * 1) / 1_000_000,
		);
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

	// @logTextGeneration
	async generateText(userPrompt: string, systemPrompt?: string, opts?: GenerateTextOptions): Promise<string> {
		logger.info(`MockLLM ${opts?.id ?? '<no id>'} ${userPrompt}`);
		if(!opts?.id) logger.info(new Error(`No id set for prompt ${userPrompt}`))
		return withActiveSpan('generateText', async (span) => {
			const prompt = combinePrompts(userPrompt, systemPrompt);
			this.lastPrompt = prompt;
			if (systemPrompt) span.setAttribute('systemPrompt', systemPrompt);
			span.setAttributes({
				userPrompt,
				inputChars: prompt.length,
				model: this.model,
				service: this.service,
			});

			if (this.responses.length === 0) throw new Error(`Need to call setResponses on MockLLM before calling generateText for prompt ${userPrompt}`);

			const caller: CallerId = { agentId: agentContext().agentId };
			const llmRequestSave = appContext().llmCallService.saveRequest(userPrompt, systemPrompt);
			const requestTime = Date.now();

			// remove the first item from this.responses
			const { response: responseText, callback } = this.responses.shift()!;

			// Call the callback function if it exists
			if (callback) {
				callback(prompt);
			}

			const timeToFirstToken = 1;
			const finishTime = Date.now();
			const llmRequest = await llmRequestSave;
			const llmResponse: CreateLlmResponse = {
				llmId: this.getId(),
				llmRequestId: llmRequest.id,
				responseText,
				requestTime,
				timeToFirstToken: timeToFirstToken,
				totalTime: finishTime - requestTime,
				callStack: agentContext().callStack.join(' > '),
			};
			await appContext().llmCallService.saveResponse(llmRequest.id, caller, llmResponse);

			const inputCost = this.calculateInputCost(prompt);
			const outputCost = this.calculateOutputCost(responseText);
			const cost = inputCost + outputCost;
			span.setAttributes({
				response: responseText,
				timeToFirstToken,
				inputCost,
				outputCost,
				cost,
				outputChars: responseText.length,
			});

			addCost(cost);

			logger.info(`MockLLM response ${responseText}`);
			return responseText;
		});
	}
}
