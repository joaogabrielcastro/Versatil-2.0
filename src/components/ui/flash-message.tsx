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
          ? "border-stop/30 bg-stop-soft text-stop"
          : "border-ok/30 bg-ok-soft text-ok"
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
