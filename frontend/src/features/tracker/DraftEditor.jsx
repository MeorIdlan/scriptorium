import MarkdownField from "../../components/MarkdownField";
import { wordCount } from "../../lib/utils";

export default function DraftEditor({ value, onChange, placeholder }) {
  const wc = wordCount(value);
  return (
    <div>
      <MarkdownField
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={14}
        minHeight="220px"
        textareaStyle={{ fontSize: "15px", color: "#c8c0b0" }}
        style={{ fontSize: "15px" }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
        {wc > 0 && (
          <span style={{ fontSize: "11px", color: "#5a5a72", letterSpacing: "0.04em", fontFamily: "'Georgia', serif" }}>
            {wc.toLocaleString()} {wc === 1 ? "word" : "words"}
          </span>
        )}
      </div>
    </div>
  );
}
