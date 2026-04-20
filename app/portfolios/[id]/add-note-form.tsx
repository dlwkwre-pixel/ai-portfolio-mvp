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
        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
      >
        {isOpen ? "Close Form" : "Add Note"}
      </button>

      {isOpen ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Add Portfolio Note</h3>
            <p className="mt-1 text-sm text-slate-400">
              Save context, thesis, or reminders for this account.
            </p>
          </div>

          <form
            className="mt-4 grid gap-3"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createPortfolioNote(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : "Something went wrong."
                  );
                }
              });
            }}
          >
            <input type="hidden" name="portfolio_id" value={portfolioId} />

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Note Title
              </label>
              <input
                name="title"
                type="text"
                placeholder="Why this account exists"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Note Content
              </label>
              <textarea
                name="content"
                placeholder="This is my long-term taxable growth account. I want to keep turnover low and only add high-conviction names."
                className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Saving..." : "Save Note"}
              </button>

              <button
                type="button"
                onClick={toggleOpen}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}