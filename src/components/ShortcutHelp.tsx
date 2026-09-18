import { motion } from 'motion/react';
import { IconClose } from './Icons';

const KEYS: [string, string][] = [
  ['/', 'Focus search'],
  ['⌘K', 'Jump to client or industry'],
  ['P', 'Pitch mode — hide internal columns'],
  ['G', 'Grid view'],
  ['F', 'Reach Field (3D)'],
  ['T', 'Toggle light / dark'],
  ['D', 'Comfortable / compact rows'],
  ['↑ ↓ ← →', 'Move through the grid'],
  ['C', 'Copy link to this search'],
  ['E', 'Export results as CSV'],
  ['R', 'Reset everything'],
  ['?', 'This list'],
  ['Esc', 'Close any panel'],
];

export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="cmdk__scrim" onClick={onClose} />
      <motion.div
        className="cmdk" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
        style={{ padding: 22 }}
        initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em' }}>Keyboard</h3>
          <button className="pane__close" onClick={onClose} aria-label="Close"
            style={{ marginLeft: 'auto' }}><IconClose /></button>
        </div>
        <div className="shortcuts">
          {KEYS.map(([k, label]) => (
            <div className="shortcut" key={k}>
              <span className="kbd">{k}</span> {label}
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
}
