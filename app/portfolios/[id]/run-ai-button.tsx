"use client";

import { useFormStatus } from "react-dom";

type RunAiButtonProps = {
  label?: string;
};

export default function RunAiButton({
  label = "Run AI Review",
}: RunAiButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Running AI..." : label}
    </button>
  );
}