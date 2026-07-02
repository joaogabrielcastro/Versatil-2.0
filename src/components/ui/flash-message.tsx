type FlashMessageProps = {
  error?: string | null;
  success?: string | null;
  onDismiss?: () => void;
};

export function FlashMessage({ error, success, onDismiss }: FlashMessageProps) {
  if (!error && !success) return null;

  const isError = Boolean(error);
  const text = error ?? success;

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      <span>{text}</span>
      {onDismiss ? (
        <button
          type="button"
          className="shrink-0 text-xs underline underline-offset-2 opacity-80"
          onClick={onDismiss}
        >
          Fechar
        </button>
      ) : null}
    </div>
  );
}
