import type {
  EventBus,
  EventHandler,
  EventName,
  EventPayload,
  Unsubscribe,
} from '@/types/events.ts';

export class GameEventBus implements EventBus {
  #handlers = new Map<EventName, Set<EventHandler<never>>>();
  #dispatching = 0;

  on<K extends EventName>(event: K, handler: EventHandler<K>): Unsubscribe {
    let set = this.#handlers.get(event);
    if (!set) {
      set = new Set();
      this.#handlers.set(event, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(event, handler);
  }

  once<K extends EventName>(event: K, handler: EventHandler<K>): Unsubscribe {
    const wrapped = ((payload: EventPayload<K>) => {
      this.off(event, wrapped);
      handler(payload);
    }) as EventHandler<K>;
    return this.on(event, wrapped);
  }

  off<K extends EventName>(event: K, handler: EventHandler<K>): void {
    const set = this.#handlers.get(event);
    if (!set) return;
    set.delete(handler as EventHandler<never>);
    if (set.size === 0 && this.#dispatching === 0) this.#handlers.delete(event);
  }

  emit<K extends EventName>(
    ...args: EventPayload<K> extends void ? [event: K] : [event: K, payload: EventPayload<K>]
  ): void {
    const [event, payload] = args as [K, EventPayload<K>];
    const set = this.#handlers.get(event);
    if (!set || set.size === 0) return;

    this.#dispatching++;
    const snapshot = Array.from(set) as EventHandler<K>[];
    for (const handler of snapshot) {
      if (!set.has(handler as EventHandler<never>)) continue;
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${String(event)}" threw:`, err);
      }
    }
    this.#dispatching--;
  }

  clear(): void {
    this.#handlers.clear();
  }
}
