import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './styles.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

const today = new Date().toISOString().slice(0, 10)
const navItems = [
  ['dashboard', '▦', 'Dashboard'],
  ['roster', '♙', 'Roster'],
  ['schedule', '▣', 'Schedule'],
  ['pitch', '⌁', 'Pitch Counts'],
  ['dues', '$', 'Finances'],
  ['messages', '□', 'Messages'],
  ['account', '◌', 'Account'],
  ['settings', '⚙', 'Team Settings'],
]

const emptyForms = {
  team: { name: 'Lone Star Rangers', season: 'Summer 2026', age_group: '9U Travel', location: 'Texas', head_coach: '', monthly_dues: '150', daily_pitch_limit: '75' },
  roster: { player_name: '', jersey_number: '', position: '', bats: '', throws: '', parent_name: '', parent_email: '', parent_phone: '' },
  event: { title: '', event_type: 'practice', starts_at: '', location: '', opponent: '', home_away: 'home', our_score: '', opponent_score: '', result: '', status: 'scheduled', notes: '' },
  due: { title: 'Monthly Dues', due_type: 'monthly', roster_member_id: '', amount: '150', due_date: today, status: 'unpaid', paid_amount: '0', waived_amount: '0', notes: '' },
  announcement: { title: '', body: '' },
  conversation: { subject: '', recipient_key: 'all_parents', body: '' },
  pitch: { roster_member_id: '', pitches: '', pitched_on: today, opponent: '', notes: '' },
}

const baseballPositions = ['Pitcher', 'Catcher', 'First Base', 'Second Base', 'Third Base', 'Shortstop', 'Left Field', 'Center Field', 'Right Field', 'Utility']

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [team, setTeam] = useState(null)
  const [data, setData] = useState({ roster: [], parentClaims: [], events: [], dues: [], announcements: [], pitchCounts: [], conversations: [], conversationMessages: [], members: [], notifications: [] })
  const [loading, setLoading] = useState(Boolean(supabase))
  const [message, setMessage] = useState('')
  const [activePage, setActivePage] = useState('dashboard')

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session)
      setLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setProfile(null)
      setTeam(null)
      setData({ roster: [], parentClaims: [], events: [], dues: [], announcements: [], pitchCounts: [], conversations: [], conversationMessages: [], members: [], notifications: [] })
      setActivePage('dashboard')
    })

    return () => authListener.subscription.unsubscribe()
  }, [])

  const loadWorkspace = useCallback(async () => {
    if (!session?.user) return

    setLoading(true)
    setMessage('')

    let { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()

    if ((!profileError && !profileRow) || profileError?.code === 'PGRST116') {
      const metadata = session.user.user_metadata || {}
      const fallbackProfile = {
        id: session.user.id,
        full_name: metadata.full_name || session.user.email?.split('@')[0] || '',
        role: ['coach', 'parent', 'follower'].includes(metadata.role) ? metadata.role : 'parent',
        email: session.user.email,
      }

      const { error: createProfileError } = await supabase.from('profiles').insert(fallbackProfile)
      profileError = createProfileError

      if (!profileError) {
        const { data: createdProfile, error: reloadProfileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        profileRow = createdProfile
        profileError = reloadProfileError
      }
    }

    if (profileError || !profileRow) {
      setMessage(profileError?.message || 'Unable to load your account.')
      setLoading(false)
      return
    }

    setProfile(profileRow)

    if (!profileRow.team_id) {
      setTeam(null)
      setData({ roster: [], parentClaims: [], events: [], dues: [], announcements: [], pitchCounts: [], conversations: [], conversationMessages: [], members: [], notifications: [] })
      setLoading(false)
      return
    }

    const [teamResult, rosterResult, claimResult, eventResult, dueResult, announcementResult, pitchResult, conversationResult, messageResult, memberResult, notificationResult] = await Promise.all([
      supabase.from('teams').select('*').eq('id', profileRow.team_id).maybeSingle(),
      supabase.from('roster_members').select('*').eq('team_id', profileRow.team_id).order('player_name'),
      supabase.from('roster_parent_claims').select('*').eq('team_id', profileRow.team_id),
      supabase.from('events').select('*').eq('team_id', profileRow.team_id).order('starts_at'),
      supabase
        .from('dues')
        .select('*, roster_members(player_name, parent_email)')
        .eq('team_id', profileRow.team_id)
        .order('due_date', { ascending: true }),
      supabase
        .from('announcements')
        .select('*')
        .eq('team_id', profileRow.team_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('pitch_counts')
        .select('*, roster_members(player_name, jersey_number)')
        .eq('team_id', profileRow.team_id)
        .order('pitched_on', { ascending: false }),
      supabase
        .from('conversations')
        .select('*')
        .eq('team_id', profileRow.team_id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('conversation_messages')
        .select('*')
        .eq('team_id', profileRow.team_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('*')
        .eq('team_id', profileRow.team_id)
        .order('full_name'),
      supabase
        .from('notifications')
        .select('*')
        .eq('team_id', profileRow.team_id)
        .eq('recipient_id', session.user.id)
        .order('created_at', { ascending: false }),
    ])

    const error = teamResult.error || rosterResult.error || claimResult.error || eventResult.error || dueResult.error || announcementResult.error || pitchResult.error || conversationResult.error || messageResult.error || memberResult.error || notificationResult.error
    if (error) setMessage(error.message)

    setTeam(teamResult.data || null)
    setData({
      roster: rosterResult.data || [],
      parentClaims: claimResult.data || [],
      events: eventResult.data || [],
      dues: dueResult.data || [],
      announcements: announcementResult.data || [],
      pitchCounts: pitchResult.data || [],
      conversations: conversationResult.data || [],
      conversationMessages: messageResult.data || [],
      members: memberResult.data || [],
      notifications: notificationResult.data || [],
    })
    setLoading(false)
  }, [session?.user])

  useEffect(() => {
    if (!session?.user) return
    loadWorkspace()
  }, [session?.user, loadWorkspace])

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (!supabase) return <PublicShell><MissingEnv /></PublicShell>
  if (loading) return <PublicShell><p className="muted">Loading TeamSync...</p></PublicShell>
  if (!session) return <AuthScreen />
  if (!profile) return <PublicShell>{message ? <div className="notice">{message}</div> : <p className="muted">Loading your account...</p>}</PublicShell>

  if (!profile.team_id) {
    return (
      <PublicShell profile={profile} onSignOut={signOut}>
        {message && <div className="notice">{message}</div>}
        <TeamSetup profile={profile} onDone={loadWorkspace} />
      </PublicShell>
    )
  }

  return (
    <AppShell
      activePage={activePage}
      data={data}
      onPage={setActivePage}
      onSignOut={signOut}
      profile={profile}
      team={team}
    >
      {message && <div className="notice">{message}</div>}
      <MainPage
        activePage={activePage}
        data={data}
        profile={profile}
        team={team}
        onPage={setActivePage}
        onRefresh={loadWorkspace}
        setMessage={setMessage}
      />
    </AppShell>
  )
}

function PublicShell({ children, profile, onSignOut }) {
  return (
    <div className="public-app">
      <header className="public-topbar">
        <Brand team={{ name: 'TeamSync', age_group: '9U Travel', location: 'Baseball' }} />
        {profile && <button type="button" onClick={onSignOut}>Sign out</button>}
      </header>
      <main>{children}</main>
    </div>
  )
}

function AppShell({ activePage, children, data, onPage, onSignOut, profile, team }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isCoach = profile.role === 'coach'
  const claimedPlayers = getClaimedPlayers(data.roster, profile, data.parentClaims)
  const visibleData = isCoach ? data : profile.role === 'follower' ? getFollowerScopedData(data) : getParentScopedData(data, profile)
  const actionCounts = getActionCounts(visibleData)
  const parentNavKeys = ['dashboard', 'schedule', 'dues', 'messages', 'account']
  if (claimedPlayers.some(isPitcher)) parentNavKeys.splice(3, 0, 'pitch')
  const visibleNav = isCoach
    ? navItems
    : profile.role === 'follower'
      ? navItems.filter(([key]) => ['dashboard', 'schedule', 'messages', 'account'].includes(key))
      : navItems.filter(([key]) => parentNavKeys.includes(key))
  const unreadNotifications = data.notifications.filter((notification) => !notification.read_at).length
  const preferredMobileKeys = ['dashboard', 'schedule', 'roster', 'messages']
  const mobilePrimaryNav = visibleNav.filter(([key]) => preferredMobileKeys.includes(key))
  const mobileMoreNav = visibleNav.filter(([key]) => !mobilePrimaryNav.some(([primaryKey]) => primaryKey === key))
  const isMoreActive = mobileMoreNav.some(([key]) => key === activePage)

  function goToPage(key) {
    setMobileMenuOpen(false)
    onPage(key)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand team={team} />
        <p className="sidebar-label">{isCoach ? 'Coach View' : 'Parent View'}</p>
        <nav className="nav-list" aria-label="Team navigation">
          {visibleNav.map(([key, icon, label]) => (
            <button className={activePage === key ? 'active' : ''} key={key} type="button" onClick={() => onPage(key)}>
              <span>{icon}</span>
              <span className="nav-label">{label}</span>
              {key === 'messages' && actionCounts.unreadMessages > 0 && <strong className="nav-badge">{actionCounts.unreadMessages}</strong>}
              {key === 'dues' && actionCounts.openDues > 0 && <strong className="nav-badge">{actionCounts.openDues}</strong>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="mini-profile">
            <span>{initials(profile.full_name || profile.email)}</span>
            <div>
              <strong>{profile.full_name || profile.email}</strong>
              <small>{profile.role}</small>
            </div>
          </div>
          <button className="signout" type="button" onClick={onSignOut}>↪ Sign Out</button>
          {unreadNotifications > 0 && <small className="notification-pill">{unreadNotifications} unread notification{unreadNotifications === 1 ? '' : 's'}</small>}
          {isCoach && <small className="muted-dark">{data.roster.length} players · Code {team?.join_code}</small>}
        </div>
      </aside>
      <main className="content">{children}</main>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobilePrimaryNav.map(([key, icon, label]) => (
          <button className={activePage === key ? 'active' : ''} key={key} type="button" onClick={() => goToPage(key)}>
            <span>{icon}</span>
            <strong>{mobileLabel(label)}</strong>
            {key === 'messages' && actionCounts.unreadMessages > 0 && <b>{actionCounts.unreadMessages}</b>}
            {key === 'dues' && actionCounts.openDues > 0 && <b>{actionCounts.openDues}</b>}
          </button>
        ))}
        {mobileMoreNav.length > 0 && (
          <button className={mobileMenuOpen || isMoreActive ? 'active' : ''} type="button" onClick={() => setMobileMenuOpen(true)}>
            <span>•••</span>
            <strong>More</strong>
          </button>
        )}
      </nav>
      {mobileMenuOpen && (
        <div className="mobile-more-overlay">
          <button aria-label="Close Menu" className="mobile-scrim" type="button" onClick={() => setMobileMenuOpen(false)} />
          <aside className="mobile-more-drawer">
            <div className="mobile-more-head">
              <Brand team={team} />
              <button aria-label="Close Menu" type="button" onClick={() => setMobileMenuOpen(false)}>×</button>
            </div>
            <p className="sidebar-label">{isCoach ? 'Coach View' : 'Parent View'}</p>
            <nav>
              {mobileMoreNav.map(([key, icon, label]) => (
                <button className={activePage === key ? 'active' : ''} key={key} type="button" onClick={() => goToPage(key)}>
                  <span>{icon}</span>
                  <strong>{label}</strong>
                  {key === 'dues' && actionCounts.openDues > 0 && <b>{actionCounts.openDues}</b>}
                  {key === 'messages' && actionCounts.unreadMessages > 0 && <b>{actionCounts.unreadMessages}</b>}
                </button>
              ))}
            </nav>
            <div className="mobile-more-profile">
              <div className="mini-profile">
                <span>{initials(profile.full_name || profile.email)}</span>
                <div>
                  <strong>{profile.full_name || profile.email}</strong>
                  <small>{profile.role}</small>
                </div>
              </div>
              <button type="button" onClick={onSignOut}>Sign Out</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function mobileLabel(label) {
  return label === 'Dashboard' ? 'Home' : label === 'Finances' ? 'Finance' : label
}

function Brand({ team }) {
  return (
    <div className="brand">
      <span className="brand-mark">🏆</span>
      <div>
        <strong>{team?.name || 'Lone Star Rangers'}</strong>
        <p>{team?.age_group || '9U Travel'} · {team?.location || 'Texas'}</p>
      </div>
    </div>
  )
}

function MainPage(props) {
  const isCoach = props.profile.role === 'coach'
  const pageData = isCoach ? props.data : props.profile.role === 'follower' ? getFollowerScopedData(props.data) : getParentScopedData(props.data, props.profile)
  const pageProps = { ...props, data: pageData, fullData: props.data }
  const pages = {
    dashboard: <DashboardPage {...pageProps} />,
    roster: <RosterPage {...pageProps} editable={isCoach} />,
    schedule: <SchedulePage {...pageProps} editable={isCoach} />,
    pitch: <PitchCountsPage {...pageProps} editable={isCoach} />,
    dues: <DuesPage {...pageProps} editable={isCoach} />,
    messages: <MessagesPage {...pageProps} editable={isCoach || props.profile.role === 'parent'} />,
    account: <AccountPage {...pageProps} />,
    settings: isCoach ? <SettingsPage {...pageProps} /> : null,
  }
  return pages[props.activePage] || pages.dashboard
}

function MissingEnv() {
  return (
    <section className="panel narrow">
      <h2>Supabase environment needed</h2>
      <p className="muted">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to `.env.local`, then restart the dev server.</p>
    </section>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState('login')
  const roleParam = new URLSearchParams(window.location.search).get('role')
  const teamCodeParam = new URLSearchParams(window.location.search).get('teamCode') || ''
  const initialRole = roleParam === 'parent' || roleParam === 'follower' ? roleParam : 'coach'
  const [role, setRole] = useState(initialRole)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamCode, setTeamCode] = useState(teamCodeParam)
  const [message, setMessage] = useState('')
  const isSignup = mode === 'signup'
  const teamCodeHelp = role === 'coach'
    ? 'Enter a code to join an existing team, or leave this blank to create a new team after signup. A new team code will be generated automatically.'
    : 'Parents and followers need a team code from a coach or invite link to join an existing team.'

  async function submit(event) {
    event.preventDefault()
    setMessage('')

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      setMessage(error ? error.message : 'Password reset link sent. Check your email.')
      return
    }

    const response = isSignup
      ? await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo: window.location.href,
        },
      })
      : await supabase.auth.signInWithPassword({ email, password })

    if (response.error) {
      setMessage(response.error.message)
      return
    }

    if (teamCode.trim() && response.data.session) {
      const { error: joinError } = await supabase.rpc('join_team_by_code', { p_join_code: teamCode.trim().toUpperCase() })
      if (joinError) {
        setMessage(joinError.message || 'Signed in, but that team code was not found.')
        return
      }
    }

    if (isSignup && !response.data.session) setMessage('Check your email to confirm your account, then sign in.')
  }

  return (
    <PublicShell>
      <section className="auth-grid">
        <div className="auth-copy">
          <p className="eyebrow">Travel baseball operations</p>
          <h1>Run the season without the group-chat chaos.</h1>
          <p className="muted">Coach and parent portals for roster, schedule, dues, broadcasts, and 9U pitch-count rest tracking.</p>
        </div>
        <form className="panel form" onSubmit={submit}>
          <div className="tabs" role="tablist" aria-label="Auth mode">
            <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>Login</button>
            <button className={mode === 'signup' ? 'active' : ''} type="button" onClick={() => setMode('signup')}>Sign up</button>
          </div>
          {isSignup && (
            <>
              <label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
              <div className="tabs compact" role="tablist" aria-label="Role">
                <button className={role === 'coach' ? 'active' : ''} type="button" onClick={() => setRole('coach')}>Coach</button>
                <button className={role === 'parent' ? 'active' : ''} type="button" onClick={() => setRole('parent')}>Parent</button>
                {role === 'follower' && <button className="active" type="button">Follower</button>}
              </div>
              <label>Existing team code<input value={teamCode} onChange={(e) => setTeamCode(e.target.value)} placeholder="Example: AB12CD34" /></label>
              <p className="form-help">{teamCodeHelp}</p>
            </>
          )}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          {mode !== 'reset' && <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength="6" required /></label>}
          <button className="primary" type="submit">{mode === 'reset' ? 'Send Reset Link' : isSignup ? 'Create account' : 'Log in'}</button>
          <button type="button" onClick={() => setMode(mode === 'reset' ? 'login' : 'reset')}>{mode === 'reset' ? 'Back to login' : 'Forgot password?'}</button>
          {message && <p className="notice">{message}</p>}
        </form>
      </section>
    </PublicShell>
  )
}

function TeamSetup({ profile, onDone }) {
  const [mode, setMode] = useState(profile.role === 'coach' ? 'join' : 'join')

  if (profile.role !== 'coach') return <JoinTeam onDone={onDone} profile={profile} />

  return (
    <section className="page-stack">
      <Segmented value={mode} onChange={setMode} options={[['join', 'Join existing team'], ['create', 'Create new team']]} />
      {mode === 'join' ? <JoinTeam onDone={onDone} profile={profile} /> : <CreateTeam onDone={onDone} />}
    </section>
  )
}

function CreateTeam({ onDone }) {
  const [form, setForm] = useState(emptyForms.team)
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    const { data: userData } = await supabase.auth.getUser()
    const payload = {
      ...form,
      monthly_dues: Number(form.monthly_dues || 0),
      daily_pitch_limit: Number(form.daily_pitch_limit || 75),
      created_by: userData.user.id,
    }
    const { data: team, error } = await supabase.from('teams').insert(payload).select().maybeSingle()
    if (error || !team) return setMessage(error?.message || 'Unable to create team.')

    const { error: profileError } = await supabase.from('profiles').update({ team_id: team.id }).eq('id', userData.user.id)
    if (profileError) setMessage(profileError.message)
    else onDone()
  }

  return (
    <section className="panel narrow">
      <h2>Create your travel team</h2>
      <form className="form two-col" onSubmit={submit}>
        <label>Team name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Season<input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} required /></label>
        <label>Age group<input value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })} /></label>
        <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
        <label>Head coach<input value={form.head_coach} onChange={(e) => setForm({ ...form, head_coach: e.target.value })} /></label>
        <label>Daily pitch limit<input type="number" value={form.daily_pitch_limit} onChange={(e) => setForm({ ...form, daily_pitch_limit: e.target.value })} /></label>
        <button className="primary" type="submit">Create team</button>
        {message && <p className="notice wide">{message}</p>}
      </form>
    </section>
  )
}

function JoinTeam({ onDone }) {
  const params = new URLSearchParams(window.location.search)
  const inviteCode = params.get('teamCode') || ''
  const invitePlayerId = params.get('playerId') || ''
  const [code, setCode] = useState(inviteCode)
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    const { error } = await supabase.rpc('join_team_by_code', { p_join_code: code.trim().toUpperCase() })
    if (error) {
      setMessage(error.message || 'Team code not found.')
      return
    }

    if (invitePlayerId) {
      const { error: claimError } = await supabase.rpc('claim_roster_member', { p_roster_member_id: invitePlayerId })
      if (claimError) {
        setMessage(`Joined the team, but could not claim the player yet. ${claimError.message}`)
        return
      }
    }

    onDone()
  }

  return (
    <section className="panel narrow">
      <h2>Join your team</h2>
      <form className="form" onSubmit={submit}>
        <label>Team code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AB12CD34" required /></label>
        <button className="primary" type="submit">Join team</button>
        {message && <p className="notice">{message}</p>}
      </form>
    </section>
  )
}

function DashboardPage({ data, fullData, onPage, onRefresh, profile, setMessage, team }) {
  const isParent = profile.role === 'parent'
  const isFollower = profile.role === 'follower'
  const claimRoster = fullData?.roster || data.roster
  const claimRecords = fullData?.parentClaims || data.parentClaims || []
  const claimedPlayers = getClaimedPlayers(claimRoster, profile, claimRecords)
  const claimablePlayers = claimRoster.filter((player) => !claimedPlayers.some((claimedPlayer) => claimedPlayer.id === player.id))
  const upcoming = data.events.filter((event) => new Date(event.starts_at) >= new Date()).slice(0, 3)
  const nextEvent = upcoming[0]
  const hasTeamData = data.roster.length || data.events.length || data.dues.length || data.announcements.length
  const recentBroadcast = data.announcements[0]
  const actionCounts = getActionCounts(data)
  const financeDismissKey = `teamsync:finance-alert:${profile.id}:${team?.id}:${actionCounts.openDues}:${data.dues.filter(needsDueAction).map((due) => `${due.id}:${due.status}:${due.paid_amount}:${due.waived_amount}`).join('|')}`
  const broadcastDismissKey = recentBroadcast ? `teamsync:broadcast-alert:${profile.id}:${recentBroadcast.id}` : ''
  const [dismissedFinanceKey, setDismissedFinanceKey] = useState(() => localStorage.getItem('teamsync:dismissed-finance-alert') || '')
  const [dismissedBroadcastKey, setDismissedBroadcastKey] = useState(() => localStorage.getItem('teamsync:dismissed-broadcast-alert') || '')
  const showFinanceAction = actionCounts.openDues > 0 && (!isParent && !isFollower ? dismissedFinanceKey !== financeDismissKey : true)
  const hasActions = actionCounts.unreadMessages > 0 || showFinanceAction
  const showBroadcastAlert = recentBroadcast && isRecentBroadcast(recentBroadcast) && dismissedBroadcastKey !== broadcastDismissKey
  const dueTotals = getTotals(data.dues)
  const latestConversation = data.conversations[0]

  function dismissFinanceAction() {
    localStorage.setItem('teamsync:dismissed-finance-alert', financeDismissKey)
    setDismissedFinanceKey(financeDismissKey)
  }

  function dismissBroadcastAlert() {
    localStorage.setItem('teamsync:dismissed-broadcast-alert', broadcastDismissKey)
    setDismissedBroadcastKey(broadcastDismissKey)
  }

  return (
    <div className="page-stack dashboard-page">
      <PageHeader title={isFollower ? 'Follower Dashboard' : isParent ? 'Parent Dashboard' : 'Coach Dashboard'} subtitle={`${team?.name} · ${team?.season || 'Current season'}`} />
      {isParent && claimedPlayers.length === 0 && <ParentClaimPanel claimedPlayers={claimedPlayers} onRefresh={onRefresh} players={claimablePlayers} profile={profile} setMessage={setMessage} />}
      {hasActions && (
        <section className="action-panel">
          <div>
            <span className="alert-dot" />
            <div>
              <strong>Action Needed</strong>
              <p>{[
                actionCounts.unreadMessages > 0 ? `${actionCounts.unreadMessages} Unread Message${actionCounts.unreadMessages === 1 ? '' : 's'}` : '',
                showFinanceAction ? `${actionCounts.openDues} Open Due${actionCounts.openDues === 1 ? '' : 's'}` : '',
              ].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div>
            {actionCounts.unreadMessages > 0 && <button type="button" onClick={() => onPage('messages')}>Open Messages</button>}
            {showFinanceAction && <button type="button" onClick={() => onPage('dues')}>View Finances</button>}
            {!isParent && !isFollower && showFinanceAction && <button aria-label="Dismiss Finance Alert" className="icon-dismiss" title="Dismiss Finance Alert" type="button" onClick={dismissFinanceAction}>×</button>}
          </div>
        </section>
      )}
      {showBroadcastAlert && (
        <section className="broadcast-alert">
          <div>
            <span className="broadcast">⌁</span>
            <div>
              <small>Team Broadcast</small>
              <strong>{recentBroadcast.title}</strong>
              <p>{recentBroadcast.body}</p>
              <span>{formatDate(recentBroadcast.created_at)}</span>
            </div>
          </div>
          <div>
            <button type="button" onClick={() => onPage('messages')}>Open</button>
            <button aria-label="Dismiss Broadcast Alert" className="icon-dismiss" title="Dismiss Broadcast Alert" type="button" onClick={dismissBroadcastAlert}>×</button>
          </div>
        </section>
      )}
      {(isParent || isFollower) && (
        <section className="family-dashboard">
          <section className="family-hero">
            <p>{nextEvent ? 'Next Up' : 'Schedule'}</p>
            <h2>{nextEvent ? nextEvent.title : 'No Upcoming Events'}</h2>
            <div>
              <span>{nextEvent ? formatDate(nextEvent.starts_at) : 'Your team schedule will appear here.'}</span>
              {nextEvent?.location && <span>{nextEvent.location}</span>}
            </div>
            <footer>
              {nextEvent && <Badge label={nextEvent.event_type} />}
              <button type="button" onClick={() => onPage('schedule')}>View Schedule</button>
            </footer>
          </section>
          <div className="family-dashboard-grid">
            <div className="dashboard-panel">
              <SectionBar title="Upcoming" action="View All" onAction={() => onPage('schedule')} />
              <div className="panel compact-list">
                {upcoming.map((event) => <EventRow event={event} key={event.id} />)}
                {!upcoming.length && <EmptyState title="No Events Yet" body="Games, practices, and tournaments will appear here once a coach adds them." />}
              </div>
            </div>
            <div className="dashboard-panel">
              <SectionBar title="Latest Broadcast" action="Messages" onAction={() => onPage('messages')} />
              <div className="panel dashboard-message-list">
                {recentBroadcast ? <MessageCard message={recentBroadcast} /> : <EmptyState title="No Broadcasts Yet" body="Team announcements will appear here." />}
              </div>
            </div>
          </div>
          <div className="family-side">
            {isParent && (
              <article className="family-card">
                <span>My Player{claimedPlayers.length === 1 ? '' : 's'}</span>
                <strong>{claimedPlayers.length ? claimedPlayers.map((player) => `#${player.jersey_number || '-'} ${player.player_name}`).join(', ') : 'Not Claimed Yet'}</strong>
                <button type="button" onClick={() => onPage('account')}>{claimedPlayers.length ? 'Manage' : 'Claim Player'}</button>
              </article>
            )}
            {isParent && (
              <article className={`family-card ${actionCounts.openDues ? 'needs-action' : ''}`}>
                <span>My Balance</span>
                <strong>{money(dueTotals.balance)}</strong>
                <button type="button" onClick={() => onPage('dues')}>View Finances</button>
              </article>
            )}
            <article className={`family-card ${actionCounts.unreadMessages ? 'needs-action' : ''}`}>
              <span>Messages</span>
              <strong>{actionCounts.unreadMessages ? `${actionCounts.unreadMessages} Unread` : latestConversation ? latestConversation.subject : recentBroadcast ? recentBroadcast.title : 'No Updates Yet'}</strong>
              <button type="button" onClick={() => onPage('messages')}>Open Messages</button>
            </article>
          </div>
        </section>
      )}
      {(isParent || isFollower) ? null : (
        <>
      {!hasTeamData && (
        <section className="empty-hero">
          <h2>Build Your Season Workspace</h2>
          <p>Add the roster first, then schedule games, assign dues, and post the first team message.</p>
          <div>
            <button type="button" onClick={() => onPage('roster')}>Add Players</button>
            <button type="button" onClick={() => onPage('schedule')}>Add Schedule</button>
            <button type="button" onClick={() => onPage('messages')}>Send Message</button>
          </div>
        </section>
      )}
      <section className="dashboard-top-grid">
        <div className="dashboard-summary-stack">
          <Stat icon="roster" label={isParent ? 'My Players' : 'Roster'} value={isParent ? `${claimedPlayers.length} Claimed` : `${data.roster.length} Players`} onClick={() => onPage('roster')} />
          <Stat icon="schedule" label="Upcoming" value={`${upcoming.length} Events`} onClick={() => onPage('schedule')} />
          <Stat icon="messages" label="Messages" value={actionCounts.unreadMessages ? `${actionCounts.unreadMessages} Unread` : 'No New'} onClick={() => onPage('messages')} />
        </div>
        <section className="today-card">
          <p>{nextEvent ? 'Today' : 'Next Up'}</p>
          <h2>{nextEvent ? nextEvent.title : 'No Upcoming Event'}</h2>
          <div>
            <span>{nextEvent ? formatDate(nextEvent.starts_at) : 'Schedule TBD'}</span>
            <span>{nextEvent?.location || 'Location TBD'}</span>
          </div>
          <footer>
            <Badge label={nextEvent?.event_type || 'Event'} />
            <button type="button" onClick={() => onPage('schedule')}>View Schedule</button>
          </footer>
        </section>
      </section>
      <section className="dashboard-bottom-grid">
        <div className="dashboard-panel">
          <SectionBar title="Schedule" action="Manage" onAction={() => onPage('schedule')} />
          <div className="panel compact-list">
            {upcoming.map((event) => <EventRow event={event} key={event.id} />)}
            {!upcoming.length && <EmptyState title="No Events Yet" body="Add practices, games, tournaments, and meetings so families know what is next." action="Add Schedule" onAction={() => onPage('schedule')} />}
          </div>
        </div>
        <div className="dashboard-panel">
          <SectionBar title="Messages" action="View All" onAction={() => onPage('messages')} />
          <div className="panel dashboard-message-list">
            {data.conversations.slice(0, 4).map((conversation) => (
              <div className="message-preview" key={conversation.id}>
                <strong>{conversation.subject}</strong>
                <p>{conversation.recipient_name || 'Team conversation'}</p>
              </div>
            ))}
            {!data.conversations.length && recentBroadcast && <MessageCard message={recentBroadcast} />}
            {!data.conversations.length && !recentBroadcast && <EmptyState title="No Messages Yet" body="Broadcasts and conversations will appear here." action="Message Team" onAction={() => onPage('messages')} />}
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  )
}

function RosterPage({ data, editable, fullData, onRefresh, profile, setMessage, team }) {
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(emptyForms.roster)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForms.roster)
  const [copyStatus, setCopyStatus] = useState('')
  const [inviteDraft, setInviteDraft] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const isParent = profile.role === 'parent'
  const claimRoster = fullData?.roster || data.roster
  const claimRecords = fullData?.parentClaims || data.parentClaims || []
  const claimedPlayers = getClaimedPlayers(claimRoster, profile, claimRecords)
  const claimablePlayers = claimRoster.filter((player) => !claimedPlayers.some((claimedPlayer) => claimedPlayer.id === player.id))
  const parentContactsByPlayer = getParentContactsByPlayer(data.roster, data.members, claimRecords)
  const roster = data.roster.filter((player) => `${player.player_name} ${player.jersey_number}`.toLowerCase().includes(query.toLowerCase()))

  async function submit(event) {
    event.preventDefault()
    await saveRow('roster_members', { ...form, team_id: team.id }, emptyForms.roster, setForm, onRefresh, setMessage)
    setShowForm(false)
  }

  function startEdit(player) {
    setShowForm(false)
    setEditingId(player.id)
    setEditForm({
      player_name: player.player_name || '',
      jersey_number: player.jersey_number || '',
      position: player.position || '',
      bats: player.bats || '',
      throws: player.throws || '',
      parent_name: player.parent_name || '',
      parent_email: player.parent_email || '',
      parent_phone: player.parent_phone || '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(emptyForms.roster)
  }

  async function saveEdit(event) {
    event.preventDefault()
    setMessage('')

    const { error } = await supabase
      .from('roster_members')
      .update(editForm)
      .eq('id', editingId)

    if (error) {
      setMessage(error.message)
      return
    }

    cancelEdit()
    onRefresh()
  }

  async function deletePlayer(player) {
    setMessage('')
    const confirmed = window.confirm(`Remove ${player.player_name} from the roster?`)
    if (!confirmed) return

    const { error } = await supabase.from('roster_members').delete().eq('id', player.id)
    if (error) setMessage(error.message)
    else onRefresh()
  }

  function startParentInvite(player) {
    const inviteLink = `${window.location.origin}/?role=parent&teamCode=${team.join_code}&playerId=${player.id}`
    setInviteDraft({
      email: player.parent_email || '',
      link: inviteLink,
      playerName: player.player_name,
      subject: `Join ${team.name} on TeamSync`,
      text: `Hi,\n\nPlease join ${team.name} on TeamSync and claim ${player.player_name}.\n\n${inviteLink}\n\nTeam code: ${team.join_code}\n\nAfter signup, TeamSync will connect you to ${player.player_name}'s schedule, messages, and dues.`,
    })
    setCopyStatus('')
  }

  async function copyParentInvite() {
    if (!inviteDraft) return
    try {
      await navigator.clipboard.writeText(inviteDraft.text)
      setCopyStatus(`Invite copied for ${inviteDraft.playerName}.`)
    } catch {
      setCopyStatus(`Copy blocked. Share this link manually: ${inviteDraft.link}`)
    }
  }

  function openParentInviteEmail() {
    if (!inviteDraft) return
    window.location.assign(`mailto:${encodeURIComponent(inviteDraft.email)}?subject=${encodeURIComponent(inviteDraft.subject)}&body=${encodeURIComponent(inviteDraft.text)}`)
  }

  return (
    <div className="page-stack">
      <PageHeader title="Roster" subtitle={`${data.roster.length} players on the team`} action={editable && '+ Add Player'} onAction={() => setShowForm(!showForm)} />
      {isParent && <ParentClaimPanel claimedPlayers={claimedPlayers} onRefresh={onRefresh} players={claimablePlayers} profile={profile} setMessage={setMessage} />}
      {copyStatus && <div className="notice">{copyStatus}</div>}
      {editable && inviteDraft && (
        <section className="panel invite-composer">
          <div>
            <span>Parent Invite</span>
            <h2>Invite Parent For {inviteDraft.playerName}</h2>
            <p>This invite link sends the parent to signup and helps them claim the right player.</p>
          </div>
          <label>Parent Email<input type="email" value={inviteDraft.email} onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} placeholder="parent@email.com" /></label>
          <label>Message<textarea value={inviteDraft.text} onChange={(event) => setInviteDraft({ ...inviteDraft, text: event.target.value })} /></label>
          <div className="form-actions">
            <button className="primary" type="button" onClick={openParentInviteEmail}>Open Email Draft</button>
            <button type="button" onClick={copyParentInvite}>Copy Invite</button>
            <button type="button" onClick={() => setInviteDraft(null)}>Close</button>
          </div>
        </section>
      )}
      <section className="toolbar">
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or jersey number" />
        <div className="toolbar-meta">
          <strong>{roster.filter(isPitcher).length}</strong>
          <span>Pitchers tagged</span>
        </div>
      </section>
      {editable && showForm && (
        <form className="panel form grid-form" onSubmit={submit}>
          <input placeholder="Player name" value={form.player_name} onChange={(e) => setForm({ ...form, player_name: e.target.value })} required />
          <input placeholder="Jersey #" value={form.jersey_number} onChange={(e) => setForm({ ...form, jersey_number: e.target.value })} />
          <PositionPicker value={form.position} onChange={(position) => setForm({ ...form, position })} />
          <select value={form.bats} onChange={(e) => setForm({ ...form, bats: e.target.value })}>
            <option value="">Bats</option>
            <option value="Right">Right</option>
            <option value="Left">Left</option>
            <option value="Switch">Switch</option>
          </select>
          <select value={form.throws} onChange={(e) => setForm({ ...form, throws: e.target.value })}>
            <option value="">Throws</option>
            <option value="Right">Right</option>
            <option value="Left">Left</option>
          </select>
          <div className="form-section-title">Parent contact</div>
          <input placeholder="Parent name" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
          <input placeholder="Parent email" type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} />
          <input placeholder="Parent phone" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
          <button className="primary" type="submit">Save Player</button>
        </form>
      )}
      <section className="panel rows">
        {roster.map((player) => (
          <PlayerRow
            editable={editable}
            editForm={editForm}
            isEditing={editingId === player.id}
            key={player.id}
            onCancelEdit={cancelEdit}
            onEdit={() => startEdit(player)}
            onEditForm={setEditForm}
            onInviteParent={() => startParentInvite(player)}
            onDelete={() => deletePlayer(player)}
            onSaveEdit={saveEdit}
            parentContacts={parentContactsByPlayer.get(player.id) || []}
            player={player}
            isClaimedByCurrentParent={claimedPlayers.some((claimedPlayer) => claimedPlayer.id === player.id)}
            profile={profile}
          />
        ))}
        {!roster.length && <p className="muted">No players match that search.</p>}
      </section>
    </div>
  )
}

function SchedulePage({ data, editable, onRefresh, setMessage, team }) {
  const [tab, setTab] = useState('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForms.event)
  const [editingEventId, setEditingEventId] = useState(null)
  const [scoreForms, setScoreForms] = useState({})
  const now = new Date()
  const events = data.events.filter((event) => tab === 'upcoming' ? new Date(event.starts_at) >= now : new Date(event.starts_at) < now)

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    const payload = {
      ...form,
      team_id: team.id,
      our_score: form.our_score === '' ? null : Number(form.our_score),
      opponent_score: form.opponent_score === '' ? null : Number(form.opponent_score),
      result: form.our_score === '' || form.opponent_score === '' ? '' : form.result,
      status: form.status || 'scheduled',
    }

    if (editingEventId) {
      const originalEvent = data.events.find((item) => item.id === editingEventId)
      const { error } = await supabase.from('events').update(payload).eq('id', editingEventId)
      if (error) {
        setMessage(error.message)
        return
      }
      await notifyScheduleChange(originalEvent, payload, 'updated')
      setEditingEventId(null)
      setForm(emptyForms.event)
      setShowForm(false)
      onRefresh()
      return
    }

    await saveRow('events', payload, emptyForms.event, setForm, onRefresh, setMessage)
    setShowForm(false)
  }

  function startEdit(event) {
    setEditingEventId(event.id)
    setForm({
      title: event.title || '',
      event_type: event.event_type || 'practice',
      starts_at: toDateTimeLocal(event.starts_at),
      location: event.location || '',
      opponent: event.opponent || '',
      home_away: event.home_away || 'home',
      our_score: event.our_score ?? '',
      opponent_score: event.opponent_score ?? '',
      result: event.result || '',
      status: event.status || 'scheduled',
      notes: event.notes || '',
    })
    setShowForm(true)
  }

  function cancelEdit() {
    setEditingEventId(null)
    setForm(emptyForms.event)
    setShowForm(false)
  }

  async function cancelEvent(event) {
    setMessage('')
    const confirmed = window.confirm(`Cancel ${event.title}? Parents and followers will be notified.`)
    if (!confirmed) return

    const { error } = await supabase.from('events').update({ status: 'cancelled' }).eq('id', event.id)
    if (error) {
      setMessage(error.message)
      return
    }
    await notifyScheduleChange(event, { ...event, status: 'cancelled' }, 'cancelled')
    onRefresh()
  }

  async function notifyScheduleChange(originalEvent, nextEvent, changeType) {
    const recipients = data.members.filter((member) => ['parent', 'follower'].includes(member.role))
    if (!recipients.length) return

    const title = changeType === 'cancelled' ? `Event Cancelled: ${originalEvent?.title || nextEvent.title}` : `Schedule Updated: ${nextEvent.title}`
    const body = changeType === 'cancelled'
      ? `${originalEvent?.title || nextEvent.title} has been cancelled.`
      : `${nextEvent.title} is now set for ${formatDate(nextEvent.starts_at)} at ${nextEvent.location || 'Location TBD'}.`

    const { error } = await supabase.from('notifications').insert(recipients.map((member) => ({
      body,
      notification_type: 'schedule',
      recipient_id: member.id,
      team_id: team.id,
      title,
    })))

    if (error) setMessage(error.message)
  }

  async function saveScore(event, scoreForm) {
    setMessage('')
    const ourScore = scoreForm.our_score === '' ? null : Number(scoreForm.our_score)
    const opponentScore = scoreForm.opponent_score === '' ? null : Number(scoreForm.opponent_score)
    let result = ''
    if (Number.isFinite(ourScore) && Number.isFinite(opponentScore)) {
      if (ourScore > opponentScore) result = 'win'
      else if (ourScore < opponentScore) result = 'loss'
      else result = 'tie'
    }

    const { error } = await supabase
      .from('events')
      .update({ our_score: ourScore, opponent_score: opponentScore, result })
      .eq('id', event.id)

    if (error) setMessage(error.message)
    else onRefresh()
  }

  return (
    <div className="page-stack">
      <PageHeader title="Schedule" subtitle={`${data.events.length} events this season`} action={editable && '+ Add Event'} onAction={() => { setEditingEventId(null); setForm(emptyForms.event); setShowForm(!showForm) }} />
      <Segmented value={tab} onChange={setTab} options={[['upcoming', `Upcoming (${data.events.filter((e) => new Date(e.starts_at) >= now).length})`], ['past', `Past (${data.events.filter((e) => new Date(e.starts_at) < now).length})`]]} />
      {editable && showForm && (
        <form className="panel form grid-form" onSubmit={submit}>
          <input placeholder="Event title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
            <option value="practice">Practice</option>
            <option value="game">Game</option>
            <option value="meeting">Meeting</option>
            <option value="other">Other</option>
          </select>
          <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
          <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <input placeholder="Opponent" value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} />
          <select value={form.home_away} onChange={(e) => setForm({ ...form, home_away: e.target.value })}>
            <option value="home">Home</option>
            <option value="away">Away</option>
            <option value="neutral">Neutral</option>
          </select>
          {editingEventId && (
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}
          <input type="number" min="0" placeholder="Our score, if final" value={form.our_score} onChange={(e) => setForm({ ...form, our_score: e.target.value })} />
          <input type="number" min="0" placeholder="Opponent score, if final" value={form.opponent_score} onChange={(e) => setForm({ ...form, opponent_score: e.target.value })} />
          <div className="edit-actions">
            <button className="primary" type="submit">{editingEventId ? 'Save Changes' : 'Save Event'}</button>
            {editingEventId && <button type="button" onClick={cancelEdit}>Cancel Edit</button>}
          </div>
        </form>
      )}
      <div className="event-list">
        {events.map((event) => (
          <EventCard
            editable={editable}
            event={event}
            key={event.id}
            onCancel={() => cancelEvent(event)}
            onEdit={() => startEdit(event)}
            onScoreChange={(scoreForm) => setScoreForms({ ...scoreForms, [event.id]: scoreForm })}
            onScoreSave={(scoreForm) => saveScore(event, scoreForm)}
            scoreForm={scoreForms[event.id] || { our_score: event.our_score ?? '', opponent_score: event.opponent_score ?? '' }}
            scoreEditable={editable && tab === 'past' && event.event_type === 'game'}
          />
        ))}
        {!events.length && <EmptyState title={`No ${tab} events`} body={tab === 'upcoming' ? 'Add games, practices, tournaments, and meetings for the season.' : 'Past games will show here once their date has passed.'} />}
      </div>
    </div>
  )
}

function PitchCountsPage({ data, editable, onRefresh, setMessage, team }) {
  const [form, setForm] = useState(emptyForms.pitch)
  const [showForm, setShowForm] = useState(false)
  const availability = getPitchAvailability(data.roster, data.pitchCounts, team)
  const pitcherRoster = data.roster.filter(isPitcher)
  const pitchRows = [...availability.resting, ...availability.eligible].sort((a, b) => a.player.player_name.localeCompare(b.player.player_name))
  const selectedPitcher = pitcherRoster.find((player) => player.id === form.roster_member_id)
  const previewRestDays = restDays(form.pitches)
  const previewEligibleDate = form.pitched_on ? addDays(form.pitched_on, previewRestDays) : null

  async function submit(event) {
    event.preventDefault()
    await saveRow(
      'pitch_counts',
      { ...form, team_id: team.id, pitches: Number(form.pitches || 0), pitched_on: form.pitched_on || today, roster_member_id: form.roster_member_id || null },
      emptyForms.pitch,
      setForm,
      onRefresh,
      setMessage,
    )
    setShowForm(false)
  }

  function openPitchForm(playerId = '') {
    setForm({ ...emptyForms.pitch, roster_member_id: playerId, pitched_on: today })
    setShowForm(true)
  }

  return (
    <div className="page-stack">
      <PageHeader title="Pitch Counts" subtitle="Pitch Smart compliance and rest-day tracking (9U)" action={editable && '+ Log Pitches'} onAction={() => openPitchForm()} />
      <section className="compliance-note">
        <strong>ⓘ USA Baseball Pitch Smart — Ages 9-10</strong>
        <p>Daily max: {team?.daily_pitch_limit || 75} pitches. Required rest: 1-20 pitches = 0 days · 21-35 = 1 day · 36-50 = 2 days · 51-65 = 3 days · 66+ = 4 days.</p>
      </section>
      <section className="pitch-overview">
        <article className="metric green">
          <span>Eligible Today</span>
          <p>{availability.eligible.length}</p>
          <strong>{availability.eligible.length ? availability.eligible.map((row) => row.player.player_name).join(', ') : 'No Pitchers Ready'}</strong>
        </article>
        <article className="metric red">
          <span>Need Rest</span>
          <p>{availability.resting.length}</p>
          <strong>{availability.resting.length ? availability.resting.map((row) => row.player.player_name).join(', ') : 'No One Resting'}</strong>
        </article>
        <article className="metric">
          <span>Tagged Pitchers</span>
          <p>{pitcherRoster.length}</p>
          <strong>{pitcherRoster.length ? `${pitcherRoster.length} on roster` : 'Tag pitchers on roster'}</strong>
        </article>
      </section>
      {editable && showForm && (
        <form className="panel form grid-form" onSubmit={submit}>
          <select value={form.roster_member_id} onChange={(e) => setForm({ ...form, roster_member_id: e.target.value })} required>
            <option value="">Choose pitcher</option>
            {pitcherRoster.map((player) => <option key={player.id} value={player.id}>#{player.jersey_number} {player.player_name}</option>)}
          </select>
          <input type="number" min="0" placeholder="Pitches" value={form.pitches} onChange={(e) => setForm({ ...form, pitches: e.target.value })} required />
          <input type="date" value={form.pitched_on} onChange={(e) => setForm({ ...form, pitched_on: e.target.value })} />
          <input placeholder="Game/opponent" value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} />
          <div className="pitch-log-preview">
            <span>Rest Preview</span>
            <strong>{form.pitches ? `${previewRestDays} Rest Day${previewRestDays === 1 ? '' : 's'}` : 'Enter Pitch Count'}</strong>
            <p>{selectedPitcher ? `${selectedPitcher.player_name} ${previewEligibleDate ? `eligible ${previewRestDays ? formatShortDate(previewEligibleDate) : 'today'}` : ''}` : 'Choose a pitcher to preview eligibility.'}</p>
          </div>
          <button className="primary" type="submit">Log Pitch Count</button>
        </form>
      )}
      {editable && !pitcherRoster.length && <EmptyState title="No pitchers tagged" body="Open Roster, edit a player, and check Pitcher so they can appear in pitch count decisions." />}
      <section className="panel pitch-table-card">
        <h2>Pitcher Status</h2>
        <div className="pitch-table-wrap">
          <table className="pitch-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Status</th>
                <th>Last Outing</th>
                <th>Last Pitches</th>
                <th>Rest</th>
                <th>Eligible</th>
                <th>Season</th>
                <th>Outings</th>
              </tr>
            </thead>
            <tbody>
              {pitchRows.map((row) => {
                const resting = row.resting
                const logs = data.pitchCounts.filter((log) => log.roster_member_id === row.player.id)
                const seasonPitches = logs.reduce((sum, log) => sum + Number(log.pitches || 0), 0)
                return (
                  <tr key={row.player.id}>
                    <td><span>#{row.player.jersey_number || '-'}</span> {row.player.player_name}</td>
                    <td><Badge label={resting ? 'Resting' : 'Available'} /></td>
                    <td>{row.last ? formatShortDate(row.last.pitched_on) : '—'}</td>
                    <td>{row.last?.pitches || 0}</td>
                    <td>{row.last ? `${restDays(row.last.pitches)}d` : '0d'}</td>
                    <td>{resting ? formatShortDate(row.availableOn) : 'Today'}</td>
                    <td>{seasonPitches}</td>
                    <td>
                      <span>{logs.length}</span>
                      {editable && <button className="table-action" type="button" onClick={() => openPitchForm(row.player.id)}>Log</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!pitchRows.length && <EmptyState title="No pitchers available yet" body="Tag players as Pitcher on the roster, then log pitch counts after games." />}
      </section>
    </div>
  )
}

function DuesPage({ data, editable, onRefresh, setMessage, team }) {
  const [financeTab, setFinanceTab] = useState('monthly')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForms.due)
  const [monthDate, setMonthDate] = useState(new Date(today))
  const monthKey = getMonthKey(monthDate)
  const monthDues = data.dues.filter((due) => getMonthKey(due.due_date || due.created_at) === monthKey)
  const monthTotals = getTotals(monthDues)
  const monthlyTotals = getTotals(monthDues.filter((due) => due.due_type === 'monthly'))
  const tournamentTotals = getTotals(monthDues.filter((due) => due.due_type === 'tournament'))
  const percent = monthTotals.amount ? Math.round((monthTotals.paid / monthTotals.amount) * 100) : 0
  const openDues = monthDues.filter(needsDueAction)
  const monthlyByPlayer = new Map(monthDues.filter((due) => due.due_type === 'monthly').map((due) => [due.roster_member_id, due]))
  const tournamentGroups = groupTournamentDues(data.dues)

  function openDuesForm(type = financeTab) {
    setFinanceTab(type)
    setForm({
      ...emptyForms.due,
      due_type: type,
      title: type === 'monthly' ? 'Monthly Dues' : 'Tournament Fee',
    })
    setShowForm(true)
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    const baseDue = {
      ...form,
      team_id: team.id,
      amount: Number(form.amount || 0),
      paid_amount: Number(form.paid_amount || 0),
      waived_amount: Number(form.waived_amount || 0),
      due_date: form.due_date || null,
    }
    const payload = form.roster_member_id
      ? [{ ...baseDue, roster_member_id: form.roster_member_id }]
      : data.roster.map((player) => ({ ...baseDue, roster_member_id: player.id }))

    if (!payload.length) {
      setMessage('Add roster players before assigning team dues.')
      return
    }

    const { error } = await supabase.from('dues').insert(payload)
    if (error) {
      setMessage(error.message)
      return
    }
    setForm(emptyForms.due)
    setShowForm(false)
    onRefresh()
  }

  async function markPaid(due) {
    setMessage('')
    const { error } = await supabase.from('dues').update({ status: 'paid', paid_amount: due.amount }).eq('id', due.id)
    if (error) setMessage(error.message)
    else onRefresh()
  }

  async function waiveDue(due) {
    setMessage('')
    const { error } = await supabase
      .from('dues')
      .update({ status: 'waived', waived_amount: due.amount, paid_amount: 0 })
      .eq('id', due.id)

    if (error) setMessage(error.message)
    else onRefresh()
  }

  async function markUnpaid(due) {
    setMessage('')
    const { error } = await supabase
      .from('dues')
      .update({ status: 'unpaid', paid_amount: 0, waived_amount: 0 })
      .eq('id', due.id)

    if (error) setMessage(error.message)
    else onRefresh()
  }

  return (
    <div className="page-stack finances-page">
      <PageHeader title="Team Finances" subtitle="Track monthly dues and tournament fees for your team" action={editable && (financeTab === 'monthly' ? '+ Assign Dues' : '+ New Fee')} onAction={() => openDuesForm(financeTab)} />
      <Segmented value={financeTab} onChange={setFinanceTab} options={[['monthly', '$ Monthly Dues'], ['tournament', '♕ Tournament Fees']]} />
      {openDues.length > 0 && (
        <section className="action-panel compact-action finance-alert">
          <div>
            <span className="alert-dot" />
            <div>
              <strong>{openDues.length} due{openDues.length === 1 ? '' : 's'} need attention</strong>
              <p>{editable ? 'Review unpaid or partial player balances before the next event.' : 'You have an outstanding balance for your claimed player.'}</p>
            </div>
          </div>
        </section>
      )}
      <section className="dues-summary">
        <MetricCard label="Collected" value={money(monthTotals.paid)} tone="green" />
        <MetricCard label="Outstanding" value={money(monthTotals.balance)} tone="red" />
        <MetricCard label="Waived" value={money(monthTotals.waived)} tone="neutral" />
        <MetricCard label="Collection Rate" value={`${percent}%`} tone="neutral" />
      </section>
      <section className="panel dues-progress">
        <div className="split"><p>{formatMonth(monthDate)} Collection</p><strong>{percent}%</strong></div>
        <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        <div className="dues-breakdown">
          <div><span>Monthly Dues</span><strong>{money(monthlyTotals.paid)} / {money(monthlyTotals.amount)}</strong></div>
          <div><span>Tournament Fees</span><strong>{money(tournamentTotals.paid)} / {money(tournamentTotals.amount)}</strong></div>
          <div><span>{editable ? 'Team Deficit' : 'My Balance'}</span><strong>{money(monthTotals.balance)}</strong></div>
        </div>
      </section>
      {!editable && (
        <section className="panel rows">
          {monthDues.map((due) => <DueRow due={due} editable={false} key={due.id} onPaid={markPaid} onUnpaid={markUnpaid} onWaive={waiveDue} />)}
          {!monthDues.length && <EmptyState title="No dues assigned" body="Once dues are assigned for your claimed player, your monthly and tournament balances will appear here." />}
        </section>
      )}
      {editable && showForm && (
        <form className="panel form grid-form finance-form" onSubmit={submit}>
          <div className="form-section-title">{form.due_type === 'monthly' ? 'Assign Monthly Dues' : 'Assign Tournament Fee'}</div>
          <input placeholder="Dues title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <select value={form.due_type} onChange={(e) => setForm({ ...form, due_type: e.target.value, title: e.target.value === 'monthly' ? 'Monthly Dues' : 'Tournament Fee' })}>
            <option value="monthly">Monthly dues</option>
            <option value="tournament">Tournament fee</option>
            <option value="other">Other</option>
          </select>
          <select value={form.roster_member_id} onChange={(e) => setForm({ ...form, roster_member_id: e.target.value })}>
            <option value="">Whole team</option>
            {data.roster.map((player) => <option key={player.id} value={player.id}>{player.player_name}</option>)}
          </select>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          <input type="number" min="0" step="0.01" placeholder="Waived amount" value={form.waived_amount} onChange={(e) => setForm({ ...form, waived_amount: e.target.value })} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
          <div className="form-actions">
            <button className="primary" type="submit">Assign Dues</button>
            <button className="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          {!form.roster_member_id && <p className="form-help">Whole team creates one due record for each roster player so every family can see their own balance.</p>}
        </form>
      )}
      {editable && (financeTab === 'monthly' ? (
        <>
          <section className="finance-month-bar">
            <button type="button" onClick={() => setMonthDate(addMonths(monthDate, -1))}>‹</button>
            <div>
              <strong>{formatMonth(monthDate)}</strong>
              <p>{monthlyTotals.amount ? `${money(monthlyTotals.amount / Math.max(1, monthDues.filter((due) => due.due_type === 'monthly').length))} per player / month` : 'No monthly dues assigned yet'}</p>
            </div>
            <button type="button" onClick={() => setMonthDate(addMonths(monthDate, 1))}>›</button>
          </section>
          <section className="panel finance-table-card">
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>{formatMonth(monthDate)}<span>{monthDues.filter((due) => due.due_type === 'monthly' && due.status === 'paid').length}/{data.roster.length}</span></th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roster.map((player) => {
                    const due = monthlyByPlayer.get(player.id)
                    return (
                      <tr key={player.id}>
                        <td><strong>{player.player_name}</strong><span>#{player.jersey_number || '-'}</span></td>
                        <td><FinanceStatusCell due={due} /></td>
                        <td>{due ? money(Math.max(0, Number(due.amount || 0) - Number(due.paid_amount || 0) - Number(due.waived_amount || 0))) : '—'}</td>
                        <td>
                          {due ? (
                            <div className="finance-actions">
                              <button type="button" onClick={() => markPaid(due)}>Paid</button>
                              <button type="button" onClick={() => waiveDue(due)}>Waive</button>
                              <button type="button" onClick={() => markUnpaid(due)}>Reset</button>
                            </div>
                          ) : <span className="muted">Not assigned</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!data.roster.length && <EmptyState title="No players yet" body="Add players before assigning monthly dues." />}
          </section>
        </>
      ) : (
        <section className="finance-tournament-list">
          {tournamentGroups.map((group) => <TournamentFeeCard group={group} key={group.key} onPaid={markPaid} onUnpaid={markUnpaid} onWaive={waiveDue} />)}
          {!tournamentGroups.length && <EmptyState title="No tournament fees yet" body="Create a tournament fee for the whole team or a specific player." />}
        </section>
      ))}
    </div>
  )
}

function FinanceStatusCell({ due }) {
  if (!due) return <span className="finance-check empty" aria-label="Not assigned" />
  return <span className={`finance-check ${due.status}`} aria-label={due.status}>{due.status === 'paid' ? '✓' : due.status === 'waived' ? '–' : ''}</span>
}

function TournamentFeeCard({ group, onPaid, onUnpaid, onWaive }) {
  const totals = getTotals(group.dues)
  const paidCount = group.dues.filter((due) => due.status === 'paid').length
  const waivedCount = group.dues.filter((due) => due.status === 'waived').length
  const outstandingCount = group.dues.length - paidCount - waivedCount
  const percent = totals.amount ? Math.round((totals.paid / totals.amount) * 100) : 0

  return (
    <article className="tournament-fee-card">
      <div className="tournament-fee-head">
        <span className="money">♕</span>
        <div>
          <h3>{group.title}</h3>
          <p>{money(group.amount)} per player · {formatShortDate(group.dueDate)}</p>
        </div>
      </div>
      <div className="tournament-fee-total">
        <strong>{money(totals.paid)} collected</strong>
        <span>/ {money(totals.amount)} total</span>
      </div>
      <div className="progress"><span style={{ width: `${percent}%` }} /></div>
      <div className="finance-pills">
        <Badge label={`${paidCount} paid`} />
        <Badge label={`${outstandingCount} outstanding`} />
        <Badge label={`${waivedCount} waived`} />
      </div>
      <div className="tournament-player-actions">
        {group.dues.map((due) => (
          <div key={due.id}>
            <span>{due.roster_members?.player_name || due.title}</span>
            <FinanceStatusCell due={due} />
            <button type="button" onClick={() => onPaid(due)}>Paid</button>
            <button type="button" onClick={() => onWaive(due)}>Waive</button>
            <button type="button" onClick={() => onUnpaid(due)}>Reset</button>
          </div>
        ))}
      </div>
    </article>
  )
}

function MessagesPage({ data, editable, onRefresh, profile, setMessage, team }) {
  const [form, setForm] = useState(emptyForms.announcement)
  const [conversationForm, setConversationForm] = useState(emptyForms.conversation)
  const [mode, setMode] = useState(profile.role === 'follower' ? 'broadcast' : 'conversation')
  const [showForm, setShowForm] = useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [selectedBroadcastId, setSelectedBroadcastId] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const recipientOptions = getRecipientOptions(data, profile)
  const selectedConversation = data.conversations.find((conversation) => conversation.id === selectedConversationId)
  const selectedBroadcast = data.announcements.find((announcement) => announcement.id === selectedBroadcastId)
  const unreadMessages = data.notifications.filter((notification) => !notification.read_at && notification.notification_type === 'message')

  function startBroadcastReply(broadcast) {
    setMode('conversation')
    setSelectedBroadcastId('')
    setSelectedConversationId('')
    setConversationForm({
      subject: `Re: ${broadcast.title}`,
      recipient_key: profile.role === 'coach' ? 'all_parents' : 'all_coaches',
      body: '',
    })
    setShowForm(true)
  }

  async function submitBroadcast(event) {
    event.preventDefault()
    const { data: userData } = await supabase.auth.getUser()
    setMessage('')
    const { error } = await supabase.from('announcements').insert({ ...form, team_id: team.id, created_by: userData.user.id })
    if (error) {
      setMessage(error.message)
      return
    }
    setForm(emptyForms.announcement)
    setMessage('Broadcast sent.')
    setShowForm(false)
    setMode('broadcast')
    onRefresh()
  }

  async function submitConversation(event) {
    event.preventDefault()
    setMessage('')
    const recipient = resolveRecipient(conversationForm.recipient_key, recipientOptions)

    const { error } = await supabase.rpc('start_conversation_thread', {
      p_body: conversationForm.body,
      p_recipient_name: recipient.label,
      p_recipient_profile_id: recipient.profileId || null,
      p_recipient_type: recipient.type,
      p_roster_member_id: recipient.rosterMemberId || null,
      p_subject: conversationForm.subject,
      p_team_id: team.id,
    })

    if (error) {
      setMessage(error.message || 'Unable to start conversation.')
      return
    }

    setConversationForm(emptyForms.conversation)
    setShowForm(false)
    setMessage('Message sent.')
    onRefresh()
  }

  async function submitReply(event) {
    event.preventDefault()
    if (!selectedConversation || !replyBody.trim()) return
    setMessage('')
    const { error } = await supabase.rpc('reply_to_conversation_thread', {
      p_body: replyBody.trim(),
      p_conversation_id: selectedConversation.id,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setReplyBody('')
    setMessage('Reply sent.')
    onRefresh()
  }

  async function markMessagesRead() {
    if (!unreadMessages.length) return
    setMessage('')
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadMessages.map((notification) => notification.id))

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Messages marked as read.')
    onRefresh()
  }

  return (
    <div className="page-stack">
      <PageHeader title="Messages" subtitle={`${data.announcements.length} broadcasts · ${data.conversations.length} conversations · ${data.notifications.filter((notification) => !notification.read_at).length} unread`} action={editable && (mode === 'conversation' || profile.role === 'coach') && '+ New Message'} onAction={() => setShowForm(!showForm)} />
      {unreadMessages.length > 0 && (
        <section className="action-panel compact-action">
          <div>
            <span className="alert-dot" />
            <div>
              <strong>{unreadMessages.length} unread message notification{unreadMessages.length === 1 ? '' : 's'}</strong>
              <p>Open the latest threads or mark them read once handled.</p>
            </div>
          </div>
          <button type="button" onClick={markMessagesRead}>Mark Read</button>
        </section>
      )}
      <Segmented value={mode} onChange={(nextMode) => { setMode(nextMode); setSelectedConversationId(''); setSelectedBroadcastId('') }} options={profile.role === 'follower' ? [['broadcast', 'Broadcasts']] : [['conversation', 'Conversations'], ['broadcast', 'Broadcasts']]} />
      {showForm && mode === 'broadcast' && profile.role === 'coach' && (
        <form className="panel form" onSubmit={submitBroadcast}>
          <input placeholder="Broadcast title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea placeholder="Message to the team" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <button className="primary" type="submit">Send Broadcast</button>
        </form>
      )}
      {showForm && mode === 'conversation' && editable && (
        <form className="panel form grid-form" onSubmit={submitConversation}>
          <input placeholder="Subject" value={conversationForm.subject} onChange={(e) => setConversationForm({ ...conversationForm, subject: e.target.value })} required />
          <select value={conversationForm.recipient_key} onChange={(e) => setConversationForm({ ...conversationForm, recipient_key: e.target.value })}>
            {recipientOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <p className="form-help">This creates in-app notifications, not emails. Browser push can use these same notification records before launch.</p>
          <textarea placeholder="Message" value={conversationForm.body} onChange={(e) => setConversationForm({ ...conversationForm, body: e.target.value })} required />
          <button className="primary" type="submit">Start Conversation</button>
        </form>
      )}
      {mode === 'broadcast' ? (
        <>
          <SectionBar title="Team Broadcasts" count={data.announcements.length} />
          {selectedBroadcast && <BroadcastDetail broadcast={selectedBroadcast} onBack={() => setSelectedBroadcastId('')} onReply={profile.role === 'follower' ? null : () => startBroadcastReply(selectedBroadcast)} />}
          {!selectedBroadcast && (
            <section className="rows">
              {data.announcements.map((message) => <MessageCard key={message.id} message={message} onOpen={() => setSelectedBroadcastId(message.id)} />)}
              {!data.announcements.length && <EmptyState title="No broadcasts yet" body="Broadcasts are team updates for game reminders, weather changes, and announcements." />}
            </section>
          )}
        </>
      ) : (
        <>
          <SectionBar title="Conversations" count={data.conversations.length} />
          {selectedConversation && (
            <ConversationDetail
              conversation={selectedConversation}
              messages={data.conversationMessages.filter((message) => message.conversation_id === selectedConversation.id).reverse()}
              onBack={() => setSelectedConversationId('')}
              onReply={submitReply}
              replyBody={replyBody}
              setReplyBody={setReplyBody}
            />
          )}
          <section className="rows">
            {!selectedConversation && data.conversations.map((conversation) => <ConversationCard conversation={conversation} key={conversation.id} messages={data.conversationMessages.filter((message) => message.conversation_id === conversation.id)} onOpen={() => setSelectedConversationId(conversation.id)} />)}
            {!data.conversations.length && <EmptyState title="No conversations yet" body="Start a normal message thread with a parent or another coach." />}
          </section>
        </>
      )}
    </div>
  )
}

function AccountPage({ data, fullData, onRefresh, profile, setMessage, team }) {
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const isParent = profile.role === 'parent'
  const claimRoster = fullData?.roster || data.roster
  const claimRecords = fullData?.parentClaims || data.parentClaims || []
  const claimedPlayers = getClaimedPlayers(claimRoster, profile, claimRecords)
  const claimablePlayers = claimRoster.filter((player) => !claimedPlayers.some((claimedPlayer) => claimedPlayer.id === player.id))

  async function saveProfile(event) {
    event.preventDefault()
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', profile.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Account profile updated.')
    onRefresh()
  }

  async function changePassword(event) {
    event.preventDefault()
    setMessage('')

    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setMessage(error.message)
      return
    }

    setNewPassword('')
    setConfirmPassword('')
    setMessage('Password updated.')
  }

  return (
    <div className="page-stack">
      <PageHeader title="Account" subtitle="Your TeamSync login and profile" />
      {isParent && (
        <>
          <ParentClaimPanel claimedPlayers={claimedPlayers} onRefresh={onRefresh} players={claimablePlayers} profile={profile} setMessage={setMessage} />
          {claimedPlayers.length > 0 && <FollowerInvitePanel claimedPlayers={claimedPlayers} team={team} />}
        </>
      )}
      <section className="two-panels">
        <form className="panel form" onSubmit={saveProfile}>
          <h2>Profile</h2>
          <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
          <label>Email<input value={profile.email || ''} disabled readOnly /></label>
          <label>Role<input value={profile.role || ''} disabled readOnly /></label>
          <button className="primary fit" type="submit">Save Profile</button>
        </form>
        <form className="panel form" onSubmit={changePassword}>
          <h2>Change Password</h2>
          <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="6" required /></label>
          <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="6" required /></label>
          <button className="primary fit" type="submit">Update Password</button>
          <p className="form-help">This changes the password for the account you are signed into right now.</p>
        </form>
      </section>
    </div>
  )
}

function SettingsPage({ data, onRefresh, setMessage, team }) {
  const [form, setForm] = useState({
    name: team?.name || '',
    season: team?.season || '',
    age_group: team?.age_group || '',
    location: team?.location || '',
    head_coach: team?.head_coach || '',
    monthly_dues: team?.monthly_dues || '',
    daily_pitch_limit: team?.daily_pitch_limit || 75,
  })
  const [copyStatus, setCopyStatus] = useState('')
  const inviteLink = `${window.location.origin}/?role=coach&teamCode=${team?.join_code || ''}`
  const inviteMessage = `Join ${team?.name || 'our team'} on TeamSync as a coach: ${inviteLink}\nTeam code: ${team?.join_code || ''}`

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    const { error } = await supabase
      .from('teams')
      .update({ ...form, monthly_dues: Number(form.monthly_dues || 0), daily_pitch_limit: Number(form.daily_pitch_limit || 75) })
      .eq('id', team.id)
    if (error) setMessage(error.message)
    else onRefresh()
  }

  async function copyInvite() {
    setCopyStatus('')
    try {
      await navigator.clipboard.writeText(inviteMessage)
      setCopyStatus('Invite copied')
    } catch {
      setCopyStatus('Copy is blocked in this browser. Select the invite text and copy it manually.')
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Team Settings" subtitle="Baseball details, dues defaults, and pitch limits" />
      <form className="form settings-form" onSubmit={submit}>
        <label>Team Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Season *<input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} required /></label>
        <div className="form-row">
          <label>Age Group<input value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })} /></label>
          <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
        </div>
        <label>Head Coach Name<input value={form.head_coach} onChange={(e) => setForm({ ...form, head_coach: e.target.value })} /></label>
        <div className="form-row">
          <label>Monthly Dues ($)<input type="number" value={form.monthly_dues} onChange={(e) => setForm({ ...form, monthly_dues: e.target.value })} /></label>
          <label>Daily Pitch Limit<input type="number" value={form.daily_pitch_limit} onChange={(e) => setForm({ ...form, daily_pitch_limit: e.target.value })} /></label>
        </div>
        <button className="primary fit" type="submit">Save Settings</button>
      </form>
      <section className="settings-invite">
        <div>
          <h2>Coaches & Admins</h2>
          <p>Send this to another coach. They can sign up, choose Coach, and join this team with the code.</p>
        </div>
        <div className="invite-box">
          <span>Coach invite code</span>
          <strong>{team?.join_code}</strong>
          <textarea readOnly value={inviteMessage} aria-label="Coach invite message" />
          <button className="primary fit" type="button" onClick={copyInvite}>Copy Invite</button>
          {copyStatus && <p className="form-help">{copyStatus}</p>}
        </div>
      </section>
      <TeamMembersPanel data={data} setMessage={setMessage} />
    </div>
  )
}

function TeamMembersPanel({ data, setMessage }) {
  const coaches = data.members.filter((member) => member.role === 'coach')
  const parents = data.members.filter((member) => member.role === 'parent')
  const followers = data.members.filter((member) => member.role === 'follower')

  return (
    <section className="member-directory">
      <div className="section-bar">
        <h3>Team Members <span>{data.members.length}</span></h3>
      </div>
      <div className="member-columns">
        <MemberGroup members={coaches} setMessage={setMessage} title="Coaches" />
        <MemberGroup members={parents} parentClaims={data.parentClaims} roster={data.roster} setMessage={setMessage} title="Parents" />
        <MemberGroup members={followers} setMessage={setMessage} title="Followers" />
      </div>
    </section>
  )
}

function MemberGroup({ members, parentClaims = [], roster = [], setMessage, title }) {
  return (
    <div className="panel member-list">
      <h3>{title} <span>{members.length}</span></h3>
      {members.map((member) => (
        <MemberRow key={member.id} member={member} parentClaims={parentClaims} roster={roster} setMessage={setMessage} />
      ))}
      {!members.length && <EmptyState title={`No ${title.toLowerCase()} yet`} body="Signed-up team members will appear here." />}
    </div>
  )
}

function MemberRow({ member, parentClaims, roster, setMessage }) {
  const claimedPlayerIds = new Set(parentClaims.filter((claim) => claim.parent_profile_id === member.id).map((claim) => claim.roster_member_id))
  const claimedPlayers = roster.filter((player) => (
    claimedPlayerIds.has(player.id) ||
    (member.role === 'parent' && player.parent_profile_id === member.id) ||
    (member.role === 'parent' && player.parent_email?.toLowerCase() === member.email?.toLowerCase())
  ))

  async function sendReset() {
    if (!member.email) return
    const { error } = await supabase.auth.resetPasswordForEmail(member.email, { redirectTo: window.location.origin })
    setMessage(error ? error.message : `Password reset sent to ${member.email}.`)
  }

  return (
    <article className="member-row">
      <span>{initials(member.full_name || member.email)}</span>
      <div>
        <strong>{member.full_name || 'Unnamed member'}</strong>
        <p>{member.email || 'No email on file'}</p>
        {member.role === 'parent' && (
          <small>{claimedPlayers.length ? `Players: ${claimedPlayers.map((player) => player.player_name).join(', ')}` : 'No players claimed yet'}</small>
        )}
      </div>
      <Badge label={member.role} />
      <button type="button" onClick={sendReset}>Reset</button>
    </article>
  )
}

function PageHeader({ action, onAction, subtitle, title }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <button className="primary" type="button" onClick={onAction}>{action}</button>}
    </header>
  )
}

function Stat({ icon, label, onClick, value }) {
  return (
    <button className="stat-card" type="button" onClick={onClick}>
      <span className={`stat-icon stat-${icon}`} aria-hidden="true" />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <b aria-hidden="true">›</b>
    </button>
  )
}

function MetricCard({ label, tone, value }) {
  return <section className={`metric ${tone}`}><p>{label}</p><strong>{value}</strong></section>
}

function SectionBar({ action, count, onAction, title }) {
  return (
    <div className="section-bar">
      <h3>{title} {Number.isFinite(count) && <span>{count}</span>}</h3>
      {action && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  )
}

function Segmented({ onChange, options, value }) {
  return (
    <div className="segmented">
      {options.map(([key, label]) => <button className={value === key ? 'active' : ''} key={key} type="button" onClick={() => onChange(key)}>{label}</button>)}
    </div>
  )
}

function ParentClaimPanel({ claimedPlayers, onRefresh, players, profile, setMessage }) {
  const [claimingId, setClaimingId] = useState('')

  async function claimPlayer(playerId) {
    if (!playerId) return
    setMessage('')
    setClaimingId(playerId)
    const { error } = await supabase.rpc('claim_roster_member', { p_roster_member_id: playerId })
    setClaimingId('')

    if (error) {
      setMessage(error.message)
      return
    }

    onRefresh()
  }

  return (
    <section className="claim-panel">
      <div>
        <h2>{claimedPlayers.length ? 'My Players' : 'Claim Your Player'}</h2>
        <p>{claimedPlayers.length ? claimedPlayers.map((player) => player.player_name).join(', ') : 'Pick your kid from the roster. After that, dues and player-specific messages will be limited to your family.'}</p>
      </div>
      <div>
        <select value="" onChange={(event) => claimPlayer(event.target.value)} aria-label="Claim player">
          <option value="">Claim a player</option>
          {players.map((player) => <option key={player.id} value={player.id}>#{player.jersey_number || '-'} {player.player_name}</option>)}
        </select>
        {!players.length && <small>You have claimed every player currently available to you.</small>}
        {claimingId && <small>Claiming player...</small>}
        <small>Signed in as {profile.email}</small>
      </div>
    </section>
  )
}

function FollowerInvitePanel({ claimedPlayers, team }) {
  const [email, setEmail] = useState('')
  const inviteLink = `${window.location.origin}/?role=follower&teamCode=${team?.join_code || ''}`
  const body = `Follow ${team?.name || 'our team'} on TeamSync for schedules and team broadcasts.\n\n${inviteLink}\n\nTeam code: ${team?.join_code || ''}\nPlayers: ${claimedPlayers.map((player) => player.player_name).join(', ')}`

  function sendInvite() {
    window.location.assign(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Follow ${team?.name || 'our team'} on TeamSync`)}&body=${encodeURIComponent(body)}`)
  }

  return (
    <section className="claim-panel">
      <div>
        <h2>Invite a Follower</h2>
        <p>Grandparents and family followers can see schedules and broadcasts only. They cannot see dues or private messages.</p>
      </div>
      <div>
        <input type="email" placeholder="Follower email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <button className="primary" type="button" onClick={sendInvite}>Email Invite</button>
      </div>
    </section>
  )
}

function PlayerRow({ editable, editForm, isClaimedByCurrentParent, isEditing, onCancelEdit, onDelete, onEdit, onEditForm, onInviteParent, onSaveEdit, parentContacts, player }) {
  const positions = splitTags(player.position)

  if (isEditing) {
    return (
      <form className="player-edit-row" onSubmit={onSaveEdit}>
        <input placeholder="Player name" value={editForm.player_name} onChange={(e) => onEditForm({ ...editForm, player_name: e.target.value })} required />
        <input placeholder="Jersey #" value={editForm.jersey_number} onChange={(e) => onEditForm({ ...editForm, jersey_number: e.target.value })} />
        <PositionPicker value={editForm.position} onChange={(position) => onEditForm({ ...editForm, position })} />
        <select value={editForm.bats} onChange={(e) => onEditForm({ ...editForm, bats: e.target.value })}>
          <option value="">Bats</option>
          <option value="Right">Right</option>
          <option value="Left">Left</option>
          <option value="Switch">Switch</option>
        </select>
        <select value={editForm.throws} onChange={(e) => onEditForm({ ...editForm, throws: e.target.value })}>
          <option value="">Throws</option>
          <option value="Right">Right</option>
          <option value="Left">Left</option>
        </select>
        <input placeholder="Parent name" value={editForm.parent_name} onChange={(e) => onEditForm({ ...editForm, parent_name: e.target.value })} />
        <input placeholder="Parent email" value={editForm.parent_email} onChange={(e) => onEditForm({ ...editForm, parent_email: e.target.value })} />
        <input placeholder="Parent phone" value={editForm.parent_phone} onChange={(e) => onEditForm({ ...editForm, parent_phone: e.target.value })} />
        <div className="edit-actions">
          <button className="primary" type="submit">Save Changes</button>
          <button type="button" onClick={onCancelEdit}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <article className="player-row">
      <span className="number">#{player.jersey_number || '-'}</span>
      <div className="player-main">
        <strong>{player.player_name}</strong>
        <p>B/T: {player.bats || '-'} / {player.throws || '-'}</p>
      </div>
      <div className="player-positions">
        {positions.length ? positions.map((position) => <span key={position}>{position}</span>) : <span>No positions</span>}
      </div>
      <div className="player-contact">
        <span className="contact-label">{parentContacts.length ? `${parentContacts.length} Claimed Parent Account${parentContacts.length === 1 ? '' : 's'}` : 'No Claimed Parent Account'}</span>
        {parentContacts.length ? parentContacts.map((contact) => (
          <div className="contact-chip" key={contact.key}>
            <strong>{contact.name}</strong>
            <p>{contact.email || 'No email'}{contact.phone ? ` · ${contact.phone}` : ''}</p>
          </div>
        )) : (player.parent_name || player.parent_email || player.parent_phone) ? (
          <div className="contact-chip manual-contact">
            <span>Manual Contact</span>
            <strong>{player.parent_name || 'No parent contact'}</strong>
            <p>{player.parent_email || 'No email'}{player.parent_phone ? ` · ${player.parent_phone}` : ''}</p>
          </div>
        ) : (
          <div className="contact-chip manual-contact">
            <strong>No parent contact</strong>
            <p>Invite a parent to claim this player.</p>
          </div>
        )}
      </div>
      {isClaimedByCurrentParent && <Badge label="My player" />}
      {editable && <div className="row-actions"><button type="button" onClick={onInviteParent}>Invite Parent</button><button type="button" onClick={onEdit}>Edit</button><button type="button" onClick={onDelete}>Remove</button></div>}
    </article>
  )
}

function PositionPicker({ onChange, value }) {
  const selected = splitTags(value)

  function toggle(position) {
    const next = selected.includes(position)
      ? selected.filter((item) => item !== position)
      : [...selected, position]
    onChange(next.join(', '))
  }

  return (
    <fieldset className="position-picker">
      <legend>Positions</legend>
      {baseballPositions.map((position) => (
        <label key={position}>
          <input checked={selected.includes(position)} type="checkbox" onChange={() => toggle(position)} />
          <span>{position}</span>
        </label>
      ))}
    </fieldset>
  )
}

function EventCard({ editable, event, onCancel, onEdit, onScoreChange, onScoreSave, scoreEditable, scoreForm }) {
  const date = new Date(event.starts_at)
  const hasScore = event.our_score !== null && event.our_score !== '' && event.opponent_score !== null && event.opponent_score !== ''
  const isCancelled = event.status === 'cancelled'
  return (
    <article className={`event-card ${isCancelled ? 'cancelled-event' : ''}`}>
      <div className="date-block"><span>{date.toLocaleString(undefined, { month: 'short' })}</span><strong>{date.getDate()}</strong><small>{date.toLocaleString(undefined, { weekday: 'short' })}</small></div>
      <div>
        <h3>{event.title} <Badge label={isCancelled ? 'cancelled' : event.event_type} /> {event.home_away && !isCancelled && <span className="desktop-detail"><Badge label={event.home_away} /></span>} {event.result && <span className="desktop-detail"><Badge label={event.result} /></span>}</h3>
        <p>{date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        <p>{event.location || 'Location TBD'} <span className="desktop-detail">{event.opponent ? `· vs. ${event.opponent}` : ''}</span></p>
        {hasScore && <p className="score-line desktop-detail">Final: {event.our_score}-{event.opponent_score}</p>}
        {editable && (
          <div className="event-actions">
            <button type="button" onClick={onEdit}>Edit</button>
            {!isCancelled && <button type="button" onClick={onCancel}>Cancel Event</button>}
          </div>
        )}
        {scoreEditable && !isCancelled && (
          <form className="score-form" onSubmit={(submitEvent) => { submitEvent.preventDefault(); onScoreSave(scoreForm) }}>
            <input type="number" min="0" aria-label="Our score" placeholder="Us" value={scoreForm.our_score} onChange={(e) => onScoreChange({ ...scoreForm, our_score: e.target.value })} />
            <input type="number" min="0" aria-label="Opponent score" placeholder="Them" value={scoreForm.opponent_score} onChange={(e) => onScoreChange({ ...scoreForm, opponent_score: e.target.value })} />
            <button type="submit">Save Score</button>
          </form>
        )}
      </div>
    </article>
  )
}

function EventRow({ event }) {
  return (
    <article className="small-row">
      <div><strong>{event.title}</strong><p>{formatDate(event.starts_at)} · {event.location || 'TBD'}</p></div>
      <Badge label={event.event_type} />
    </article>
  )
}

function PitchStatusRow({ row }) {
  return (
    <article className="small-row">
      <span className="number">#{row.player.jersey_number || '-'}</span>
      <div><strong>{row.player.player_name}</strong><p>{row.last.pitches} pitches · {formatShortDate(row.last.pitched_on)} {row.last.opponent ? `· ${row.last.opponent}` : ''}</p></div>
      <p className="resting">Resting until {formatShortDate(row.availableOn)}</p>
    </article>
  )
}

function DueRow({ due, editable, onPaid, onUnpaid, onWaive }) {
  const owed = Math.max(0, Number(due.amount || 0) - Number(due.paid_amount || 0) - Number(due.waived_amount || 0))
  const paid = Number(due.paid_amount || 0)
  const waived = Number(due.waived_amount || 0)
  return (
    <article className={`due-row status-${due.status}`}>
      <span className="money">$</span>
      <div className="due-main">
        <strong>{due.roster_members?.player_name || due.title}</strong>
        <p>{due.title} · {due.due_type || 'monthly'} · Due {due.due_date || 'TBD'}</p>
        <small>{money(paid)} paid · {money(waived)} waived</small>
      </div>
      <div className="due-balance">
        <span>Balance</span>
        <strong>{money(owed)}</strong>
      </div>
      <Badge label={due.status} />
      {editable && (
        <div className="due-actions">
          {due.status !== 'paid' && <button type="button" onClick={() => onPaid(due)}>Paid</button>}
          {due.status !== 'waived' && <button type="button" onClick={() => onWaive(due)}>Waive</button>}
          {due.status !== 'unpaid' && <button type="button" onClick={() => onUnpaid(due)}>Unpaid</button>}
        </div>
      )}
    </article>
  )
}

function MessageCard({ message, onOpen }) {
  return (
    <article className={`message-card ${onOpen ? 'clickable-card' : ''}`} onClick={onOpen}>
      <span className="broadcast">⌁</span>
      <div>
        <h3>{message.title} <Badge label="Broadcast" /></h3>
        <p>{message.body}</p>
        <small>{formatShortDate(message.created_at)}</small>
      </div>
    </article>
  )
}

function BroadcastDetail({ broadcast, onBack, onReply }) {
  return (
    <section className="panel message-thread">
      <button type="button" onClick={onBack}>Back to broadcasts</button>
      <h2>{broadcast.title}</h2>
      <p>{broadcast.body}</p>
      <small className="muted">{formatDate(broadcast.created_at)}</small>
      {onReply && <button className="primary fit" type="button" onClick={onReply}>Reply in Conversation</button>}
    </section>
  )
}

function ConversationCard({ conversation, messages, onOpen }) {
  const latest = messages[0]
  return (
    <article className="message-card clickable-card" onClick={onOpen}>
      <span className="broadcast">{initials(conversation.recipient_name || conversation.subject)}</span>
      <div>
        <h3>{conversation.subject} <Badge label="Conversation" /></h3>
        <p>{conversation.recipient_name || conversation.recipient_email || 'Team member'}</p>
        <p>{latest?.body || 'No messages yet.'}</p>
        <small>{formatShortDate(conversation.updated_at || conversation.created_at)}</small>
      </div>
    </article>
  )
}

function ConversationDetail({ conversation, messages, onBack, onReply, replyBody, setReplyBody }) {
  return (
    <section className="panel message-thread">
      <button type="button" onClick={onBack}>Back to conversations</button>
      <h2>{conversation.subject}</h2>
      <p className="muted">{conversation.recipient_name || 'Team conversation'}</p>
      <div className="thread-messages">
        {messages.map((message) => (
          <article key={message.id}>
            <p>{message.body}</p>
            <small>{formatDate(message.created_at)}</small>
          </article>
        ))}
      </div>
      <form className="form" onSubmit={onReply}>
        <textarea placeholder="Write a reply" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} required />
        <button className="primary fit" type="submit">Send Reply</button>
      </form>
    </section>
  )
}

function EmptyState({ action, body, onAction, title }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
      {action && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  )
}

function Badge({ label }) {
  return <span className={`badge ${String(label).toLowerCase()}`}>{label}</span>
}

function getActionCounts(data) {
  return {
    unreadMessages: data.notifications.filter((notification) => !notification.read_at && notification.notification_type === 'message').length,
    openDues: data.dues.filter(needsDueAction).length,
  }
}

function needsDueAction(due) {
  const balance = Number(due.amount || 0) - Number(due.paid_amount || 0) - Number(due.waived_amount || 0)
  return balance > 0 && ['unpaid', 'partial'].includes(due.status)
}

function isRecentBroadcast(broadcast) {
  if (!broadcast?.created_at) return false
  const broadcastDate = new Date(broadcast.created_at)
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return Date.now() - broadcastDate.getTime() <= sevenDays
}

function getParentScopedData(data, profile) {
  const claimedPlayers = getClaimedPlayers(data.roster, profile, data.parentClaims)
  const claimedPlayerIds = new Set(claimedPlayers.map((player) => player.id))
  const conversations = data.conversations.filter((conversation) => isConversationForProfile(conversation, profile, claimedPlayerIds))
  const conversationIds = new Set(conversations.map((conversation) => conversation.id))

  return {
    ...data,
    roster: claimedPlayers,
    dues: data.dues.filter((due) => claimedPlayerIds.has(due.roster_member_id)),
    conversations,
    conversationMessages: data.conversationMessages.filter((message) => conversationIds.has(message.conversation_id)),
  }
}

function getFollowerScopedData(data) {
  return {
    ...data,
    roster: [],
    parentClaims: [],
    dues: [],
    pitchCounts: [],
    conversations: [],
    conversationMessages: [],
    members: [],
  }
}

function isConversationForProfile(conversation, profile, claimedPlayerIds) {
  if (conversation.created_by === profile.id) return true
  if (conversation.recipient_type === 'all_team' || conversation.recipient_type === 'all_parents') return true
  if (conversation.recipient_profile_id === profile.id) return true
  if (conversation.roster_member_id && claimedPlayerIds.has(conversation.roster_member_id)) return true
  return false
}

function getClaimedPlayers(roster, profile, claims = []) {
  if (!profile?.email) return []
  const claimedPlayerIds = new Set(
    claims
      .filter((claim) => claim.parent_profile_id === profile.id)
      .map((claim) => claim.roster_member_id),
  )
  return roster.filter((player) => (
    claimedPlayerIds.has(player.id) ||
    player.parent_profile_id === profile.id
  ))
}

function getParentContactsByPlayer(roster, members = [], claims = []) {
  const membersById = new Map(members.map((member) => [member.id, member]))
  const contactsByPlayer = new Map(roster.map((player) => [player.id, []]))

  claims.forEach((claim) => {
    const contacts = contactsByPlayer.get(claim.roster_member_id)
    const parent = membersById.get(claim.parent_profile_id)
    if (!contacts || !parent) return

    contacts.push({
      email: parent.email || '',
      key: `claim:${claim.parent_profile_id}`,
      name: parent.full_name || parent.email || 'Parent',
      phone: '',
      source: 'claimed',
    })
  })

  return contactsByPlayer
}

function getRecipientOptions(data, profile) {
  const isCoach = profile?.role === 'coach'
  const options = isCoach
    ? [
      { key: 'all_team', label: 'Everyone on the team', type: 'all_team' },
      { key: 'all_parents', label: 'All parents', type: 'all_parents' },
      { key: 'all_coaches', label: 'All coaches', type: 'all_coaches' },
    ]
    : [
      { key: 'all_coaches', label: 'All coaches', type: 'all_coaches' },
    ]

  data.members.forEach((member) => {
    if (!isCoach && member.role !== 'coach') return
    options.push({
      key: `profile:${member.id}`,
      label: `${member.full_name || member.email} (${member.role})`,
      profileId: member.id,
      type: 'profile',
    })
  })

  if (isCoach) {
    data.roster.forEach((player) => {
      if (!player.parent_name && !player.parent_email) return
      options.push({
        key: `parent:${player.id}`,
        label: `${player.parent_name || 'Parent'} for ${player.player_name}`,
        rosterMemberId: player.id,
        parentEmail: player.parent_email,
        type: 'player_parent',
      })
    })
  }

  return options
}

function resolveRecipient(key, options) {
  return options.find((option) => option.key === key) || options[0]
}

async function saveRow(table, payload, empty, setForm, onRefresh, setMessage) {
  setMessage('')
  const { error } = await supabase.from(table).insert(payload)
  if (error) {
    setMessage(error.message)
    return
  }
  setForm(empty)
  onRefresh()
}

function getTotals(dues) {
  return dues.reduce((total, due) => {
    total.amount += Number(due.amount || 0)
    total.paid += Number(due.paid_amount || 0)
    total.waived += Number(due.waived_amount || 0)
    total.balance = Math.max(0, total.amount - total.paid - total.waived)
    return total
  }, { amount: 0, paid: 0, waived: 0, balance: 0 })
}

function groupTournamentDues(dues) {
  const groups = new Map()
  dues.filter((due) => due.due_type === 'tournament').forEach((due) => {
    const key = `${due.title}|${due.due_date || ''}|${Number(due.amount || 0)}`
    const current = groups.get(key) || {
      key,
      title: due.title || 'Tournament Fee',
      dueDate: due.due_date || due.created_at,
      amount: Number(due.amount || 0),
      dues: [],
    }
    current.dues.push(due)
    groups.set(key, current)
  })
  return Array.from(groups.values()).sort((a, b) => new Date(b.dueDate || 0) - new Date(a.dueDate || 0))
}

function addMonths(value, count) {
  const date = new Date(value)
  date.setMonth(date.getMonth() + count)
  return date
}

function getMonthKey(value) {
  if (!value) return ''
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(value))
}

function money(value) {
  return `$${Number(value || 0).toFixed(0)}`
}

function getPitchAvailability(roster, pitchCounts, team) {
  const pitchers = roster.filter(isPitcher)
  const latest = new Map()
  pitchCounts.forEach((log) => {
    if (!log.roster_member_id) return
    const existing = latest.get(log.roster_member_id)
    if (!existing || new Date(log.pitched_on) > new Date(existing.pitched_on)) latest.set(log.roster_member_id, log)
  })

  const now = new Date()
  const rows = pitchers.map((player) => {
    const last = latest.get(player.id)
    if (!last) return { player, last: null, resting: false }
    const availableOn = addDays(last.pitched_on, restDays(last.pitches))
    return { player, last, availableOn, resting: availableOn > now }
  })

  return {
    eligible: rows.filter((row) => !row.resting),
    resting: rows.filter((row) => row.resting),
    limit: team?.daily_pitch_limit || 75,
  }
}

function isPitcher(player) {
  return splitTags(player.position).some((position) => position.toLowerCase() === 'pitcher')
}

function restDays(pitches) {
  const count = Number(pitches || 0)
  if (count <= 20) return 0
  if (count <= 35) return 1
  if (count <= 50) return 2
  if (count <= 65) return 3
  return 4
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function splitTags(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function initials(value) {
  return String(value || 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
