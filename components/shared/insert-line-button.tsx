export function InsertLineButton({
  label,
  onClick,
  position,
}: {
  label: string;
  onClick: () => void;
  position: "top" | "bottom";
}) {
  return (
    <button
      aria-label={label}
      className={`absolute left-3 z-20 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-primary-600 bg-white text-xl font-medium leading-none text-primary-900 opacity-0 shadow-sm transition hover:bg-primary-50 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 group-hover:opacity-100 md:flex ${position === "top" ? "top-0" : "top-full"}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={label}
      type="button"
    >
      <span aria-hidden="true">+</span>
    </button>
  );
}
