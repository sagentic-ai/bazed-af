// Copyright 2024 Ahyve AI Inc.
// SPDX-License-Identifier: BUSL-1.1

import moment, { Moment } from "moment";
import shortUUID from "short-uuid";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const randomUUID = () => shortUUID.generate();

/** Used to identify objects */
export type ID = string;

/**
 * Generates a unique ID with a prefix
 * @param prefix
 * @returns
 */
export const uniqueID = (prefix: string): ID => {
  return `${prefix}-${randomUUID()}`;
};

/** Timing holds start and end time. */
export class Timing {
  private _start: Moment;
  private _end?: Moment;

  /** Creates a new Timing object. If `start` and `end` are provided, `end` must be after `start`.
   * @param start optional start time, defaults to now
   * @param end optional end time, defaults to undefined
   * @throws Error if end is before start
   */
  constructor(start?: Moment, end?: Moment) {
    const s = start;
    const e = end;
    if (s && e && e.isBefore(s)) {
      throw new Error("Timing end is before start");
    }

    this._start = s || moment();
    this._end = e || undefined;
  }

  /** Finishes the timing with current time. If already finished or started in the future, throws an error.
   * @throws Error if timing has already ended or when it started in the future
   */
  finish(): void {
    if (this.hasEnded) throw new Error("Timing has already ended");
    const now = moment();
    if (now.isBefore(this._start)) {
      throw new Error("Timing start is in the future");
    }
    this._end = now;
  }

  /** Returns true if the timing has ended */
  get hasEnded(): boolean {
    return this._end !== undefined;
  }

  /** Returns the elapsed time. If the timing has not ended, returns the time elapsed since start.
   * @returns the elapsed time
   */
  get elapsed(): moment.Duration {
    if (this._end) {
      return moment.duration(this._end.diff(this._start));
    } else {
      return moment.duration(moment().diff(this._start));
    }
  }

  /** Returns the start time */
  get start(): Moment {
    return this._start;
  }

  /** Returns the end time, or undefined if the timing has not ended */
  get end(): Moment | undefined {
    return this._end;
  }
}

/** Waits for given number of milliseconds
 * @param ms number of milliseconds to wait
 */
export const delay = async (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/** Metadata is used to identify an object in the system and keep track of object hierarchy.
 * It is useful for logging, debugging and building object hierarchies.
 */
export interface Metadata {
  /** unique ID of the object */
  ID: string;
  /** human readable topic of the object */
  topic?: string;
  /** timing of the object */
  timing: Timing;
  /** parent of the object */
  parent?: Identified;
}

/** Identified must be implemented by classes containing Metadata */
export interface Identified {
  /** Holds metadata of the object */
  metadata: Metadata;
}

/** Conclusible must be implemented by classes that can be concluded */
export interface Conclusible extends Identified {
  /** Concludes the object. Finishes the timing object in metadata. */
  conclude(): void;
}

export type Constructor<T> = new (...args: any[]) => T;

/** Constructs new Metadata and starts its timing.
 * @param t the constructor of the object, must implement `Identified`
 * @param topic the topic of the object
 */
export const meta = (t: Constructor<Identified>, topic?: string): Metadata => {
  return {
    ID: uniqueID(t.name.toLowerCase()),
    topic: topic,
    timing: new Timing(),
  };
};

export interface ChildOf<T extends Identified> {
  /** Parent of this object.
   * @throws Error if parent is not set.
   */
  parent: T;
}

export interface ParentOf<T extends Identified> {
  /** Adopt a child object, should.
   * @throws Error if child object is somebody's else or is already adopted. */
  adopt(child: T): void;
  /** Abandon a child object.
   * @throws Error throw if child object is not adopted. */
  abandon(child: T): void;
}

/// --- utils

export const jsonSchema = (zodSchema: z.ZodType<any>) => {
  return JSON.stringify(zodToJsonSchema(zodSchema));
};

const parseObject = (source: string): [any, string] => {
  const stack = [];
  let objStr = "";
  let pointer = 0;
  let inString = false;

  while (pointer < source.length) {
    const char = source[pointer];

    if (
      stack.length === 0 &&
      (char === " " || char === "\n" || char === "\r" || char === "\t")
    ) {
      pointer++;
      continue;
    }

    if (char === '"' && (pointer === 0 || source[pointer - 1] !== "\\")) {
      inString = !inString;
    }

    if (!inString) {
      if (char === "{") {
        stack.push(char);
      }

      if (char === "}") {
        stack.pop();
      }
    }

    objStr += char;

    if (stack.length === 0) {
      return [JSON.parse(objStr), source.slice(pointer + 1)];
    }

    pointer++;
  }

  throw new Error("Invalid JSON");
};

export const parseMultipleObjects = (source: string): any[] => {
  const ret = [];
  let rest = source;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (rest.length === 0) {
      break;
    }
    const [obj, next] = parseObject(rest);
    ret.push(obj);
    rest = next;
  }
  return ret;
};
