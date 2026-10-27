import { Accordion } from '../Accordion.jsx'
import ClaimQueue from './ClaimQueue.jsx'
import UserList from './UserList.jsx'
import './admin.css'

export default function AdminPanel() {
  return (
    <main className="admin">
      <Accordion>
        <ClaimQueue />
        <UserList />
      </Accordion>
    </main>
  )
}
