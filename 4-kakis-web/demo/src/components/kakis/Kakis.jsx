import { useEffect, useState } from 'react'
import {
  acceptKaki,
  createGroup,
  deleteGroup,
  getGroups,
  getKakis,
  removeKaki,
  requestKaki,
  updateGroup,
} from '../../api/accountApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Accordion, Fold, Unsaved } from '../Accordion.jsx'
import Avatar from './Avatar.jsx'
import './kakis.css'

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function Person({ person, children }) {
  return (
    <li className="kaki-row">
      <Avatar id={person.id} name={person.displayName} />
      <span className="kaki-who">
        <span className="kaki-name">{person.displayName}</span>
        {person.username && <span className="kaki-handle">@{person.username}</span>}
      </span>
      <span className="kaki-actions">{children}</span>
    </li>
  )
}

// Runs a change and shows its error in place; the change answers with fresh data.
function useAction(onDone) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async (change) => {
    setBusy(true)
    setError(null)
    try {
      onDone(await change())
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function AddKaki({ onKakis }) {
  const [username, setUsername] = useState('')
  const [sent, setSent] = useState(null)
  const { busy, error, run } = useAction(onKakis)

  const submit = async (e) => {
    e.preventDefault()
    const handle = username.trim().replace(/^@/, '').toLowerCase()
    setSent(null)
    let accepted = false
    const ok = await run(async () => {
      const next = await requestKaki(handle)
      accepted = next.kakis.some((k) => k.username === handle)
      return next
    })
    if (ok) {
      setSent(accepted ? `You and @${handle} are kakis now - they'd already asked you.` : `Request sent. Once @${handle} accepts, you can eat together.`)
      setUsername('')
    }
  }

  return (
    <Fold id="add" title="Add a kaki" summary="By their username" onSubmit={submit}>
      <label className="field">
        <span>Their username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="jiahui"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      {error && <div className="error">{error}</div>}
      {sent && <div className="ok-note">{sent}</div>}
      <div className="row-actions">
        <button type="submit" className="btn go" disabled={!username.trim() || busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </Fold>
  )
}

function Requests({ data, onKakis }) {
  const { busy, error, run } = useAction(onKakis)
  const waiting = data.incoming.length
  const summary = waiting
    ? `${count(waiting, 'request')} waiting for you`
    : data.outgoing.length
      ? `${count(data.outgoing.length, 'request')} sent`
      : 'None right now'

  return (
    <Fold id="requests" title="Requests" summary={summary} aside={waiting > 0 && <span className="pill pending">{waiting}</span>}>
      {waiting + data.outgoing.length === 0 && <p className="panel-note">No requests right now.</p>}
      {waiting > 0 && (
        <ul className="kaki-list">
          {data.incoming.map((person) => (
            <Person key={person.id} person={person}>
              <button type="button" className="btn go" disabled={busy} onClick={() => run(() => acceptKaki(person.id))}>
                Accept
              </button>
              <button type="button" className="btn quiet" disabled={busy} onClick={() => run(() => removeKaki(person.id))}>
                Decline
              </button>
            </Person>
          ))}
        </ul>
      )}
      {data.outgoing.length > 0 && (
        <>
          <div className="kaki-label">You asked</div>
          <ul className="kaki-list">
            {data.outgoing.map((person) => (
              <Person key={person.id} person={person}>
                <span className="pill quiet">Waiting</span>
                <button type="button" className="btn quiet" disabled={busy} onClick={() => run(() => removeKaki(person.id))}>
                  Cancel
                </button>
              </Person>
            ))}
          </ul>
        </>
      )}
      {error && <div className="error">{error}</div>}
    </Fold>
  )
}

function YourKakis({ data, onKakis }) {
  const { busy, error, run } = useAction(onKakis)
  const remove = (person) => {
    if (!window.confirm(`Remove ${person.displayName} as a kaki? They also leave your groups, and you leave theirs.`)) return
    run(() => removeKaki(person.id))
  }

  return (
    <Fold id="kakis" title="Your kakis" summary={data.kakis.length ? count(data.kakis.length, 'kaki') : 'None yet'}>
      {data.kakis.length === 0 ? (
        <p className="panel-note">Nobody yet. Add someone by username; once they accept, they show up here.</p>
      ) : (
        <ul className="kaki-list">
          {data.kakis.map((person) => (
            <Person key={person.id} person={person}>
              <button type="button" className="btn quiet" disabled={busy} onClick={() => remove(person)}>
                Remove
              </button>
            </Person>
          ))}
        </ul>
      )}
      {error && <div className="error">{error}</div>}
    </Fold>
  )
}

function GroupForm({ group, kakis, onGroups, onDone }) {
  const [name, setName] = useState(group?.name ?? '')
  const [memberIds, setMemberIds] = useState(group?.members.map((m) => m.id) ?? [])
  const { busy, error, run } = useAction(onGroups)
  const toggle = (id) => setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const changed = name.trim() !== (group?.name ?? '') || [...memberIds].sort().join() !== (group?.members.map((m) => m.id).sort().join() ?? '')

  const save = async () => {
    const ok = await run(() => (group ? updateGroup(group.id, name.trim(), memberIds) : createGroup(name.trim(), memberIds)))
    if (ok) onDone()
  }

  return (
    <div className="kaki-group-form">
      <label className="field">
        <span>Group name</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Thursday lunch crew" />
      </label>
      <div className="kaki-label">Who's in it (you're always in)</div>
      <div className="kaki-chips">
        {kakis.map((k) => (
          <button key={k.id} type="button" className="kaki-chip" aria-pressed={memberIds.includes(k.id)} onClick={() => toggle(k.id)}>
            <Avatar id={k.id} name={k.displayName} small />
            {k.displayName}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button type="button" className="btn go" disabled={!name.trim() || memberIds.length === 0 || busy} onClick={save}>
          {busy ? 'Saving…' : group ? 'Save group' : 'Create group'}
        </button>
        <button type="button" className="btn quiet" disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
      <Unsaved when={changed} />
    </div>
  )
}

function Groups({ groups, kakis, onGroups }) {
  const [editing, setEditing] = useState(null) // null | 'new' | a group
  const { busy, error, run } = useAction(onGroups)
  const remove = (group) => {
    if (window.confirm(`Delete the group "${group.name}"? Your kakis stay your kakis.`)) run(() => deleteGroup(group.id))
  }

  return (
    <Fold id="groups" title="Groups" summary={groups.length ? count(groups.length, 'group') : 'None yet'}>
      {kakis.length === 0 && <p className="panel-note">Add some kakis first, then save the people you often eat with as a group.</p>}
      {groups.length > 0 && (
        <ul className="kaki-list">
          {groups.map((group) => (
            <li key={group.id} className="kaki-row">
              <span className="kaki-who">
                <span className="kaki-name">{group.name}</span>
                <span className="kaki-handle">You, {group.members.map((m) => m.displayName).join(', ')}</span>
              </span>
              <span className="kaki-actions">
                <button type="button" className="btn quiet" disabled={busy} onClick={() => setEditing(group)}>
                  Edit
                </button>
                <button type="button" className="btn quiet" disabled={busy} onClick={() => remove(group)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="error">{error}</div>}
      {editing ? (
        <GroupForm
          key={editing === 'new' ? 'new' : editing.id}
          group={editing === 'new' ? null : editing}
          kakis={kakis}
          onGroups={onGroups}
          onDone={() => setEditing(null)}
        />
      ) : (
        kakis.length > 0 && (
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => setEditing('new')}>
              + New group
            </button>
          </div>
        )
      )}
    </Fold>
  )
}

// The people you eat with: requests by username, your kakis, saved groups.
export default function Kakis() {
  const { me } = useAuth()
  const [data, setData] = useState(null)
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getKakis(), getGroups()])
      .then(([kakis, saved]) => {
        setData(kakis)
        setGroups(saved)
      })
      .catch((err) => setError(err.message))
  }, [])

  // Removing a kaki also takes them out of groups, so the groups need a refresh.
  const afterRemoval = (next) => {
    setData(next)
    getGroups().then(setGroups).catch((err) => setError(err.message))
  }

  if (error && !data) return <div className="error">Kakis unavailable: {error}</div>
  if (!data || !groups) return <div className="loading">Loading your kakis…</div>

  return (
    <main className="account kakis">
      <header className="account-head">
        <h2 className="step-title">Makan kakis</h2>
        <p className="panel-note">
          The people you eat with. Pick them under "With friends" on For you, and we'll find a place that suits everyone.
        </p>
      </header>
      {!me.username && (
        <div className="kaki-note">
          Kakis add you by username, and you haven't set one yet. Add one in Profile, under Your details.
        </div>
      )}
      <Accordion>
        <AddKaki onKakis={setData} />
        <Requests data={data} onKakis={setData} />
        <YourKakis data={data} onKakis={afterRemoval} />
        <Groups groups={groups} kakis={data.kakis} onGroups={setGroups} />
      </Accordion>
    </main>
  )
}
