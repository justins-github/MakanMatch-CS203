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
import { Unsaved } from '../Accordion.jsx'
import Avatar from './Avatar.jsx'
import './kakis.css'

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '')

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

// Your own @, ready to send to friends; without one, nobody can add you.
function ShareHandle({ username, onOpenMe }) {
  const [copied, setCopied] = useState(null) // null | 'yes' | 'no'
  if (!username) {
    return (
      <div className="kaki-share missing">
        <span>Friends can't add you until you pick a username.</span>
        <button type="button" className="btn" onClick={onOpenMe}>
          Set it in Me →
        </button>
      </div>
    )
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`@${username}`)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
    setTimeout(() => setCopied(null), 2500)
  }
  return (
    <div className="kaki-share">
      <span>
        Friends add you as <b>@{username}</b>
      </span>
      <button type="button" className="btn quiet" onClick={copy}>
        {copied === 'yes' ? 'Copied' : copied === 'no' ? "Couldn't copy" : 'Copy'}
      </button>
    </div>
  )
}

function AddKaki({ onKakis, autoFocus = false }) {
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
    <form className="kaki-add" onSubmit={submit}>
      <div className="kaki-add-row">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@username"
          aria-label="Their username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
        <button type="submit" className="btn" disabled={!username.trim() || busy}>
          {busy ? 'Sending…' : 'Add'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {sent && <div className="ok-note">{sent}</div>}
    </form>
  )
}

// Someone asked you: a card you can't miss.
function Requests({ incoming, onKakis }) {
  const { busy, error, run } = useAction(onKakis)
  if (incoming.length === 0) return null
  return (
    <section className="kaki-requests" aria-label="Requests waiting for you">
      {incoming.map((person) => (
        <div key={person.id} className="kaki-request">
          <div className="kaki-request-who">
            <Avatar id={person.id} name={person.displayName} />
            <span>
              <b>{person.displayName}</b>
              {person.username && <span className="kaki-handle"> @{person.username}</span>} wants to be your kaki
            </span>
          </div>
          <div className="row-actions">
            <button type="button" className="btn go" disabled={busy} onClick={() => run(() => acceptKaki(person.id))}>
              Accept
            </button>
            <button type="button" className="btn quiet" disabled={busy} onClick={() => run(() => removeKaki(person.id))}>
              Not now
            </button>
          </div>
        </div>
      ))}
      {error && <div className="error">{error}</div>}
    </section>
  )
}

// Your kakis as faces; people you've asked sit at the end, faded, until they accept.
function Faces({ data, onKakis, onRemoved }) {
  const [open, setOpen] = useState(null) // a person's id, 'add', or null
  const { busy, error, run } = useAction(onRemoved)
  const people = [...data.kakis.map((k) => ({ ...k, asked: false })), ...data.outgoing.map((k) => ({ ...k, asked: true }))]
  const chosen = people.find((p) => p.id === open)

  const remove = async (person) => {
    if (!person.asked && !window.confirm(`Remove ${person.displayName} as a kaki? They also leave your groups, and you leave theirs.`)) return
    if (await run(() => removeKaki(person.id))) setOpen(null)
  }

  return (
    <section>
      <div className="kaki-label">Your kakis · {data.kakis.length}</div>
      <div className="kaki-faces">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            className={`kaki-face${person.asked ? ' asked' : ''}`}
            aria-pressed={open === person.id}
            onClick={() => setOpen(open === person.id ? null : person.id)}
          >
            <Avatar id={person.id} name={person.displayName} large />
            <span className="kaki-face-name">{person.displayName}</span>
            {person.asked && <span className="kaki-face-note">asked</span>}
          </button>
        ))}
        <button type="button" className="kaki-face add" aria-pressed={open === 'add'} onClick={() => setOpen(open === 'add' ? null : 'add')}>
          <span className="kaki-face-plus" aria-hidden="true">
            +
          </span>
          <span className="kaki-face-name">Add</span>
        </button>
      </div>

      {open === 'add' && (
        <div className="kaki-panel">
          <AddKaki onKakis={onKakis} autoFocus />
        </div>
      )}
      {chosen && (
        <div className="kaki-panel">
          <div className="kaki-panel-text">
            <b>{chosen.displayName}</b>
            {chosen.username && <span className="kaki-handle"> @{chosen.username}</span>}
            <div className="kaki-handle">
              {chosen.asked ? `You asked on ${day(chosen.since)} - waiting for them to accept` : `Kakis since ${day(chosen.since)}`}
            </div>
          </div>
          <button type="button" className="btn quiet" disabled={busy} onClick={() => remove(chosen)}>
            {chosen.asked ? 'Cancel request' : 'Remove'}
          </button>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </section>
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
  const remove = async () => {
    if (!window.confirm(`Delete the group "${group.name}"? Your kakis stay your kakis.`)) return
    if (await run(() => deleteGroup(group.id))) onDone()
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
        {group && (
          <button type="button" className="btn quiet kaki-delete" disabled={busy} onClick={remove}>
            Delete group
          </button>
        )}
      </div>
      <Unsaved when={changed} />
    </div>
  )
}

// Groups as cards; "Eat together" opens For you with the group already picked.
function Groups({ groups, kakis, onGroups, onEatTogether }) {
  const [editing, setEditing] = useState(null) // null | 'new' | a group id
  const done = () => setEditing(null)

  return (
    <section className="kaki-groups">
      <div className="kaki-label">Groups</div>
      {groups.map((group) => (
        <div key={group.id}>
          <div className="kaki-group-card">
            <div className="kaki-group-text">
              <b>{group.name}</b>
              <span className="kaki-stack" aria-label={`You, ${group.members.map((m) => m.displayName).join(', ')}`}>
                <Avatar id="you" name="You" small />
                {group.members.map((m) => (
                  <Avatar key={m.id} id={m.id} name={m.displayName} small />
                ))}
              </span>
            </div>
            <div className="kaki-group-actions">
              <button type="button" className="btn" onClick={() => onEatTogether(group.members.map((m) => m.id))}>
                Eat together →
              </button>
              <button type="button" className="kaki-link" onClick={() => setEditing(editing === group.id ? null : group.id)}>
                Edit
              </button>
            </div>
          </div>
          {editing === group.id && <GroupForm group={group} kakis={kakis} onGroups={onGroups} onDone={done} />}
        </div>
      ))}
      {editing === 'new' ? (
        <GroupForm group={null} kakis={kakis} onGroups={onGroups} onDone={done} />
      ) : kakis.length > 0 ? (
        <button type="button" className="kaki-new-group" onClick={() => setEditing('new')}>
          + New group
        </button>
      ) : (
        <p className="panel-note">Once someone accepts, you can save the people you often eat with as a group.</p>
      )}
    </section>
  )
}

// A new user's page: three steps instead of empty lists.
function FirstSteps({ me, data, onKakis, onOpenMe }) {
  const { busy, error, run } = useAction(onKakis)
  return (
    <ol className="kaki-steps">
      <li className={`kaki-step${me.username ? ' done' : ''}`}>
        <span className="kaki-step-num">{me.username ? '✓' : '1'}</span>
        <div className="kaki-step-body">
          <b>Pick a username</b>
          {me.username ? (
            <ShareHandle username={me.username} />
          ) : (
            <>
              <span className="panel-note">Friends add you by it.</span>
              <button type="button" className="btn kaki-step-btn" onClick={onOpenMe}>
                Set it in Me →
              </button>
            </>
          )}
        </div>
      </li>
      <li className="kaki-step">
        <span className="kaki-step-num">2</span>
        <div className="kaki-step-body">
          <b>Add a kaki</b>
          <AddKaki onKakis={onKakis} />
          {data.outgoing.map((person) => (
            <div key={person.id} className="kaki-waiting">
              <span>
                Waiting for <b>{person.displayName}</b>
                {person.username && <span className="kaki-handle"> @{person.username}</span>}
              </span>
              <button type="button" className="kaki-link" disabled={busy} onClick={() => run(() => removeKaki(person.id))}>
                Cancel
              </button>
            </div>
          ))}
          {error && <div className="error">{error}</div>}
        </div>
      </li>
      <li className="kaki-step later">
        <span className="kaki-step-num">3</span>
        <div className="kaki-step-body">
          <b>Eat together</b>
          <span className="panel-note">Once they accept, pick them under For you → With friends.</span>
        </div>
      </li>
    </ol>
  )
}

// The people you eat with: your @ to share, requests, your kakis and saved groups.
export default function Kakis({ onEatTogether, onOpenMe }) {
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

  const starting = data.kakis.length === 0 && data.incoming.length === 0

  return (
    <main className="account kakis">
      <header className="account-head">
        <h2 className="step-title">Makan kakis</h2>
        {starting && <p className="panel-note">Eat with friends and we'll find a place that suits all of you.</p>}
      </header>
      {starting ? (
        <FirstSteps me={me} data={data} onKakis={setData} onOpenMe={onOpenMe} />
      ) : (
        <>
          <ShareHandle username={me.username} onOpenMe={onOpenMe} />
          <Requests incoming={data.incoming} onKakis={setData} />
          <Faces data={data} onKakis={setData} onRemoved={afterRemoval} />
          <Groups groups={groups} kakis={data.kakis} onGroups={setGroups} onEatTogether={onEatTogether} />
        </>
      )}
    </main>
  )
}
