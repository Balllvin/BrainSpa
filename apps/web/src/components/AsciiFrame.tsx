export function AsciiFrame({ label }: { label: string }) {
  const padded = label.padEnd(Math.max(label.length, 12), " ");
  return (
    <pre className="ascii-frame" aria-hidden="true">{`┌─[ ${padded} ]─┐`}</pre>
  );
}
