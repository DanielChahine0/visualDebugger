import { useState } from 'react'
import GreetingCard from './components/BrokenSyntax'
import StudentRoster from './components/BrokenLogic'
import UserProfiles from './components/BrokenRuntime'

type Tab = 'syntax' | 'logic' | 'runtime'

const tabs: { id: Tab; label: string }[] = [
  { id: 'syntax', label: 'Greeting Card' },
  { id: 'logic', label: 'Student Roster' },
  { id: 'runtime', label: 'User Profiles' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('runtime')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Student Project Showcase</h1>
        <span className="header-badge">FlowFixer</span>
      </header>
      <nav className="tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main>
        {activeTab === 'syntax' && <GreetingCard />}
        {activeTab === 'logic' && <StudentRoster />}
        {activeTab === 'runtime' && <UserProfiles />}
      </main>
    </div>
  )
}
