import { useState, useEffect } from 'react'

interface User {
  id: number
  name: string
  email: string
  company: { name: string }
}

export default function UserProfiles() {
  const [users, setUsers] = useState<User[]>()

  useEffect(() => {
    fetch('https://jsonplaceholder.typicode.com/users?_limit=5')
      .then(res => res.json())
      .then(data => setUsers(data))
  }, [])

  return (
    <div className="component-container">
      <h2>User Profiles</h2>
      <p className="description">Directory of registered users.</p>
      <div className="user-grid">
        {users.map(user => (
          <div key={user.id} className="user-card">
            <h3>{user.name}</h3>
            <p className="user-email">{user.email}</p>
            <p className="user-company">{user.company.name}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
