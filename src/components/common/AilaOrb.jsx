export default function AilaOrb({ size = 36, pulse = false, className = '' }) {
  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full orb-gradient animate-orb"
        style={{ filter: 'saturate(1.15)' }}
      />
      <div className="absolute inset-[2px] rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center">
        <div className="w-1/2 h-1/2 rounded-full orb-gradient" />
      </div>
      {pulse && (
        <span className="absolute -inset-1 rounded-full border-2 border-primary/30 animate-ping" />
      )}
    </div>
  );
}
