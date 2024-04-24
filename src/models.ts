// Copyright 2024 Ahyve AI Inc.
// SPDX-License-Identifier: MIT

/** Available providers */
export enum Provider {
  OpenAI = "openai",
}

/** Available model types */
export enum ModelType {
  GPT4 = "gpt-4",
  GPT4Turbo = "gpt-4-turbo-preview",
  GPT4Vision = "gpt-4-vision-preview",

  GPT35 = "gpt-3.5-turbo-16k",
  GPT35Turbo = "gpt-3.5-turbo-1106",
}

/** Describes model pricing and limits */
export interface ModelPricing {
  /** provider */
  provider: Provider;
  /** price per prompt token in USD */
  prompt: number;
  /** price per completion token in USD */
  completion: number;
  /** context size in tokens */
  contextSize: number;
  /** requests per minute */
  rpm: number;
  /** tokens per minute */
  tpm: number;
  /** does it support images? */
  supportsImages?: boolean;
}

/** Describes model metadata */
export interface ModelMetadata {
  provider: Provider;
  pricing: ModelPricing;
}

/** Pricing and limits for each model */
export const pricing: Record<ModelType, ModelPricing> = {
  [ModelType.GPT4]: {
    provider: Provider.OpenAI,
    prompt: 0.03,
    completion: 0.06,
    contextSize: 8_192,
    rpm: 10_000,
    tpm: 300_000,
  },
  [ModelType.GPT4Turbo]: {
    provider: Provider.OpenAI,
    prompt: 0.01,
    completion: 0.03,
    contextSize: 128_000,
    rpm: 5000,
    tpm: 300_000,
  },
  [ModelType.GPT4Vision]: {
    provider: Provider.OpenAI,
    prompt: 0.01,
    completion: 0.03,
    contextSize: 128_000,
    rpm: 80,
    tpm: 10_000,
    supportsImages: true,
  },
  [ModelType.GPT35]: {
    provider: Provider.OpenAI,
    prompt: 0.001,
    completion: 0.002,
    contextSize: 16_385,
    rpm: 10_000,
    tpm: 1_000_000,
  },
  [ModelType.GPT35Turbo]: {
    provider: Provider.OpenAI,
    prompt: 0.001,
    completion: 0.002,
    contextSize: 16_385,
    rpm: 10_000,
    tpm: 1_000_000,
  },
};

/** Model metadata */
export const models: Record<ModelType, ModelMetadata> = {
  [ModelType.GPT4]: {
    provider: Provider.OpenAI,
    pricing: pricing[ModelType.GPT4],
  },
  [ModelType.GPT4Turbo]: {
    provider: Provider.OpenAI,
    pricing: pricing[ModelType.GPT4Turbo],
  },
  [ModelType.GPT4Vision]: {
    provider: Provider.OpenAI,
    pricing: pricing[ModelType.GPT4Vision],
  },
  [ModelType.GPT35]: {
    provider: Provider.OpenAI,
    pricing: pricing[ModelType.GPT35],
  },
  [ModelType.GPT35Turbo]: {
    provider: Provider.OpenAI,
    pricing: pricing[ModelType.GPT35Turbo],
  },
};

/** List of available models */
export const availableModels: ModelType[] = Object.keys(models) as ModelType[];
