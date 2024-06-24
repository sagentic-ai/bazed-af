// Copyright 2024 Ahyve AI Inc.
// SPDX-License-Identifier: MIT

import OpenAI, { ClientOptions } from "openai";
import { ModelMetadata } from "../models";
import {
  OpenAIClientOptions,
  ChatCompletionRequest,
  ChatCompletionResponse,
  countTokens,
} from "./common";
import { BaseClient, RejectionReason } from "./base";
import { Message } from "../thread";
import moment from "moment";
import fetch, { RequestInfo, RequestInit, Response, Headers } from "node-fetch";

/** Estimate the number of tokens in a request */
const estimateTokens = (
  request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
): number => {
  const text = JSON.stringify(request.messages);
  return countTokens(text);
};

/** OpenAI Client wrapper */
export class OpenAIClient extends BaseClient<
  OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  OpenAI.Chat.Completions.ChatCompletion,
  OpenAIClientOptions
> {
  /** OpenAI client */
  private openai: OpenAI;

  /**
   * Create a new Client.
   * @param openAIKey OpenAI API Key
   * @param model Model to use
   * @param options ClientOptions
   * @returns Client
   */
  constructor(
    openAIKey: string,
    model: ModelMetadata,
    options?: OpenAIClientOptions
  ) {
    super(model, options);

    const openAIOptions = options || {};
    const origFetch = openAIOptions.fetch || fetch;
    openAIOptions.fetch = (
      url: RequestInfo,
      opts?: RequestInit
    ): Promise<Response> => {
      return origFetch(url, opts).then((response) => {
        this.updatePools(response.headers);
        return response;
      });
    };

		const url = options?.endpointURL || model.provider.url;
    this.openai = new OpenAI({
      ...openAIOptions,
      apiKey: openAIKey,
			baseURL: url,
    });
  }

  /**
   * Update pools based on API response.
   * @returns void
   */
  private updatePools = (headers: Headers): void => {
    if (headers.has("x-ratelimit-limit-requests")) {
      this.requestPoolMax = parseInt(
        headers.get("x-ratelimit-limit-requests") || "0"
      );
    }

    if (headers.has("x-ratelimit-remaining-requests")) {
      this.requestPool = parseInt(
        headers.get("x-ratelimit-remaining-requests") || "0"
      );
    }

    if (headers.has("x-ratelimit-limit-tokens")) {
      this.tokenPoolMax = parseInt(
        headers.get("x-ratelimit-limit-tokens") || "0"
      );
    }

    if (headers.has("x-ratelimit-remaining-tokens")) {
      this.tokenPool = parseInt(
        headers.get("x-ratelimit-remaining-tokens") || "0"
      );
    }

    if (headers.has("x-ratelimit-reset-requests")) {
      clearTimeout(this.requestTimer);

      const timeToReset = parseDuration(
        headers.get("x-ratelimit-reset-requests") || "0s"
      );

      if (!timeToReset.isValid()) {
        throw new Error("Time to reset requests does not have a valid format");
      }

      this.requestTimer = setTimeout(() => {
        this.requestPool = this.requestPoolMax;
        this.requestTimer = undefined;
        this.tick("req reset");
      }, timeToReset.asMilliseconds());

      if (timeToReset.asMilliseconds() > 10000) {
        if (this.debug)
          console.log(
            "WARNING: request reset time is greater than 10 seconds",
            timeToReset.asSeconds(),
            this.model.id,
          );
      }
    }

    if (headers.has("x-ratelimit-reset-tokens")) {
      clearTimeout(this.tokenTimer);

      const timeToReset = parseDuration(
        headers.get("x-ratelimit-reset-tokens") || "0s"
      );

      if (!timeToReset.isValid()) {
        throw new Error("Time to reset tokens does not have a valid format");
      }

      this.tokenTimer = setTimeout(() => {
        this.tokenPool = this.tokenPoolMax;
        this.tokenTimer = undefined;
        this.tick("token reset");
      }, timeToReset.asMilliseconds());

      if (timeToReset.asMilliseconds() > 10000) {
        if (this.debug)
          console.log(
            "WARNING: token reset time is greater than 10 seconds",
            timeToReset.asSeconds(),
            this.model.id,
          );
      }
    }
  };

  /**
   * Create a chat completion.
   * @param request ChatCompletionCreateParamsNonStreaming
   * @returns Promise<ChatCompletion>
   */
  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const openaiRequest: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: this.model.card.checkpoint,
      temperature: request.options?.temperature,
      max_tokens: request.options?.max_tokens,
      tools: request.options?.tools,
      response_format: request.options?.response_format,
      messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
    };
    var response: OpenAI.Chat.Completions.ChatCompletion;
    if (this.model.card.supportsImages) {
      // FIXME count tokens without base64 images
      response = await this.enqueue(1000, openaiRequest);
    } else {
      const tokens = estimateTokens(openaiRequest);
      response = await this.enqueue(tokens, openaiRequest);
    }
    return {
      usage: response.usage,
      messages: response.choices.map((choice) => choice.message as Message),
    } as ChatCompletionResponse;
  }

  /**
   * Make a request to the OpenAI API
   */
  protected async makeAPIRequest(
    request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return this.openai.chat.completions.create(request);
  }

  /**
   * Parse an error from the API
   * @param error Error from the API
   * @returns RejectionReason
   * @override
   * @protected
   */
  protected parseError(error: any): RejectionReason {
    switch (error.status) {
      case 400:
        return RejectionReason.BAD_REQUEST;
      case 429:
        // rate limit or quota
        if (error.error && error.error.code === "insufficient_quota") {
          return RejectionReason.INSUFFICIENT_QUOTA;
        }
        return RejectionReason.TOO_MANY_REQUESTS;
      case 500:
        return RejectionReason.SERVER_ERROR;
      default:
        return RejectionReason.UNKNOWN;
    }
  }
}

/** Use to parse time durations coming in from OpenAI in headers */
export const parseDuration = (duration: string): moment.Duration => {
  // duration is in an unspecified format so we have to parse it manually before hadingin it off to
  // moment.duration. This format is as follows:
  // 0h0m0s0ms where h, m, s, and ms sections are optional
  // for example: 6h10m0s0ms, 6m0s, 12ms, 55s, 20s200ms, etc.

  if (duration.length > 64) {
    // This is a sanity check to prevent (very unlikely) attack on regular expressions
    console.log(
      "WARNING: duration too long when parsing time in client:",
      duration
    );
    return moment.duration(0);
  }

  duration = duration.toLowerCase();
  const parts = duration.match(/(\d{1,5}(h|ms|m|s))/g);
  if (parts === null) {
    console.log("WARNING: no parts when parsing time in client:", duration);
    return moment.duration(0);
  }
  const units: Record<string, number> = parts.reduce(
    (acc, part) => {
      const s = part.match(/(\d{1,5})(h|ms|m|s)/);
      if (s === null) {
        console.log("WARNING: invalid part format:", part);
        return acc;
      }

      const num = parseInt(s[1], 10);

      if (isNaN(num)) {
        console.log("WARNING: NaN when parsing time in client", s[1], s[2]);
        return acc;
      }

      const unit = {
        s: "seconds",
        m: "minutes",
        h: "hours",
        ms: "milliseconds",
      }[s[2]];

      if (!unit) {
        console.log("WARNING: unknown unit when parsing time in client", s[2]);
        return acc;
      }

      acc[unit] = num;
      return acc;
    },
    {} as Record<string, number>
  );
  return moment.duration(units);
};
