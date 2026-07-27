type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: Props) {
  return (
    <div className="search-bar">
      <label htmlFor="search" className="sr-only">
        Search tasks
      </label>
      <input
        id="search"
        type="search"
        placeholder="Search tasks and comments…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
