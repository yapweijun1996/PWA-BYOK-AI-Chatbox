import { toolTurnLimits } from "../javascript-tool";
import { malformed, maxArguments, record, string, type ContextBudget } from "./shared";

export function createOpenAIToolCollector(budget: ContextBudget) {
  const openAI = new Map<number, { id: string; name: string; arguments: string }>();
  const reasoningDetails: unknown[] = [];
  return {
    push(calls: unknown, details?: unknown) {
      if (Array.isArray(details)) {
        for (const detail of details) {
          const size = JSON.stringify(detail)?.length ?? 0;
          if (budget.absorb(size) && reasoningDetails.length < 128)
            reasoningDetails.push(detail);
          else budget.reject();
        }
      }
      if (!Array.isArray(calls)) return;
      for (const value of calls) {
        const call = record(value);
        const index = call?.index;
        if (
          typeof index !== "number" ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= toolTurnLimits.calls
        )
          throw malformed();
        if (call?.type !== undefined && call.type !== "function")
          throw malformed();
        const fn = record(call?.function);
        const pending = openAI.get(index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        const id = string(call?.id);
        if (id && pending.id && pending.id !== id) throw malformed();
        if (id) pending.id = id;
        pending.name += string(fn?.name);
        pending.arguments += string(fn?.arguments);
        if (
          pending.id.length > 160 ||
          pending.name.length > 64 ||
          pending.arguments.length > maxArguments
        )
          throw malformed();
        openAI.set(index, pending);
      }
    },
    calls() {
      return [...openAI.entries()].sort(([a], [b]) => a - b).map(([, call]) => ({ ...call, arguments: call.arguments || "{}" }));
    },
    reasoningDetails,
  };
}
