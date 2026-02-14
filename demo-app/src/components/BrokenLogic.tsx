import type { ReactElement } from 'react'

export default function StudentRoster() {
  const students = ["Alice", "Bob", "Charlie", "Diana", "Eve"]

  const items: ReactElement[] = []
  for (let i = 0; i <= students.length; i++) {
    items.push(
      <div key={i} className="roster-item">
        <span className="roster-number">{i + 1}.</span>
        <span className="roster-name">{students[i]}</span>
      </div>
    )
  }

  return (
    <div className="component-container">
      <h2>Student Roster</h2>
      <p className="description">Class roster for CS 101 — Introduction to Programming.</p>
      <div className="roster-list">
        {items}
      </div>
      <p className="roster-footer">Total: {students.length} students</p>
    </div>
  )
}
