"use client";

import { useState, useTransition } from "react";
import { createPortfolioNote } from "./actions";

type AddNoteFormProps = {
  portfolioId: string;
};

export default function AddNoteForm({ portfolioId }: AddNoteFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function toggleOpen() {
    setErrorMessage("");
    setIsOpen((prev) => !prev);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white"
      >
        {isOpen ? "Cancel" : "+ Add Note"}
      </button>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/3 p-4">
          <h3 className="text-sm font-semibold text-white">Add Portfolio Note</h3>
          <p className="mt-0.5 text-xs text-slate-500">Save context, thesis, or reminders for this account.</p>

          <form
            className="mt-4 grid gap-3"
            action={(formData) => {
              setErrorMessage("");
              startTransition(async () => {
                try {
                  await createPortfolioNote(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
                }
              });
            }}
          >
            <input type="hidden" name="portfolio_id" value={portfolioId} />

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500">
                Note Title
              </label>
              <input
                name="title"
                type="text"
                placeholder="Why this account exists"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500">
                Note Content
              </label>
              <textarea
                name="content"
                placeholder="This is my long-term taxable growth account. I want to keep turnover low and only add high-conviction names."
                className="min-h-28 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isPending ? "Saving..." : "Save Note"}
              </button>
              <button
                type="button"
                onClick={toggleOpen}
                className="rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
