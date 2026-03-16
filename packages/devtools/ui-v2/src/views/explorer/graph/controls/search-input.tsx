import { forwardRef } from "react";
import { SearchInput as SharedSearchInput } from "@/components/shared/search-input";

interface GraphSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  matchCount: number | null;
  endpointCount: number;
}

export const SearchInput = forwardRef<HTMLInputElement, GraphSearchInputProps>(
  function SearchInput({ value, onChange, matchCount, endpointCount }, ref) {
    const showCount = matchCount !== null && value.length > 0;
    const badge = showCount ? `${matchCount}/${endpointCount}` : undefined;

    return (
      <SharedSearchInput
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder="Search endpoints..."
        badge={badge}
        debounce={300}
      />
    );
  },
);
