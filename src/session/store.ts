/** Persisted session mapping between A2A and Agentforce identifiers. */
export interface SessionMapping {
  // A2A identifiers
  a2aContextId: string;
  a2aTaskIds: string[];

  // Agentforce identifiers
  afSessionId: string;
  afSequenceId: number;
  afAgentId: string;

  // Tenant
  tenantId: string;

  // Cached task state (for tasks/get)
  lastTaskState?: Record<string, unknown>;
  artifacts?: Record<string, unknown>[];

  // Lifecycle
  createdAt: number;   // epoch ms
  lastActivity: number; // epoch ms
  state: 'active' | 'completed' | 'expired';
}

/** Abstract session store — implemented by MemoryStore and RedisStore. */
export interface SessionStore {
  /** Get a session by its A2A contextId. */
  get(contextId: string): Promise<SessionMapping | null>;

  /** Persist a full session mapping. */
  set(contextId: string, session: SessionMapping): Promise<void>;

  /** Partially update an existing session. */
  update(contextId: string, updates: Partial<SessionMapping>): Promise<void>;

  /** Delete a session by contextId. */
  delete(contextId: string): Promise<void>;

  /** Reverse lookup: find the session that contains this taskId. */
  getByTaskId(taskId: string): Promise<SessionMapping | null>;

  /** Remove sessions whose lastActivity is older than maxAgeSec. Returns cleaned count. */
  cleanup(maxAgeSec: number): Promise<number>;
}
