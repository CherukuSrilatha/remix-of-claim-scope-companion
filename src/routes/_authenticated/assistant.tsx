import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/SiteHeader";
import { askAssistant } from "@/lib/claims.functions";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Claim assistant — AutoClaim" },
      { name: "description", content: "Ask questions about your claims and insurance cover." },
      { property: "og:title", content: "Claim assistant — AutoClaim" },
      { property: "og:description", content: "Chat with the AutoClaim assistant." },
    ],
  }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };
const SUGGESTIONS = ["Why was my claim rejected?", "What does comprehensive cover?", "How is my claim amount calculated?"];

function AssistantPage() {
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }].slice(-30);
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { reply } = await ask({ data: { messages: next } });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The assistant could not reply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10">
        <h1 className="flex items-center gap-2 text-3xl font-bold"><Bot className="size-7 text-primary" /> Claim assistant</h1>
        <div className="surface mt-6 flex-1 space-y-3 p-5">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>{s}</Button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {m.content}
              </p>
            </div>
          ))}
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <Input value={input} maxLength={2000} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your claim…" />
          <Button type="submit" disabled={busy} aria-label="Send"><Send className="size-4" /></Button>
        </form>
      </main>
    </div>
  );
}
