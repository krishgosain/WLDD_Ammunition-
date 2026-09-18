import { motion } from 'framer-motion';

/**
 * View switcher.
 *
 * The active pill is one shared element that slides between options via a
 * layout animation, so changing view reads as a single object moving rather
 * than one thing switching off and another switching on.
 */
export default function Segmented<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {value === v && (
            <motion.span
              layoutId={`seg-${label}`}
              className="segmented__pill"
              style={{ inset: 0, position: 'absolute' }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            />
          )}
          <span style={{ position: 'relative', zIndex: 1 }}>{text}</span>
        </button>
      ))}
    </div>
  );
}
