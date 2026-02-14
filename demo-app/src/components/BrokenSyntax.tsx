import { useState } from 'react'

export default function GreetingCard() {
  const [name, setName] = useState('')
  const [showCard, setShowCard] = useState(false)

  return (
    <div className="component-container">
      <h2>Greeting Card Generator</h2>
      <p className="description">Enter your name to generate a personalized greeting card.</p>
      <div className="input-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
        />
        <button onClick={() => setShowCard(true)}>
          Generate Card
        </button>
      </div>
      {showCard && name && (
        <div className="greeting-card">
          <h3>Hello, {name}!</h3>
          <p>Welcome to the Student Project Showcase.</p>
          <p className="card-footer">Generated with React</p>
        </div>
      )}
    </div>

}
