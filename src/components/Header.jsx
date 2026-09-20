export function Header({ progress }) {
  const isLight = progress > 0.82
  return (
    <header className={`site-header ${isLight ? 'is-light' : ''}`}>
      <div className="logo">🚀</div>
      <nav>
        <a href="#what">What</a>
        <a href="#how">How</a>
        <a href="#why">Why</a>
        <button className="buy">Buy</button>
      </nav>
    </header>
  )
}
