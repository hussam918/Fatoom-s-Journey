"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Baby, BookOpenCheck, CalendarDays, Check, CheckCheck, CheckCircle2,
  ChevronLeft, CircleHelp, Clock3, Gift, Heart, Home, LogOut, Pencil, Plus, RefreshCw, ShieldCheck,
  Sparkles, Star, Trash2, Trophy, X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import type { Completion, Family, PointAdjustment, Profile, Reward, RewardRequest, Task } from "@/lib/types";

type Notice = { kind: "success" | "error"; text: string } | null;

const weekdayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
// This is the dedicated Supabase Auth identity for Fatima. The six-digit PIN is
// her password; keeping a separate Auth user preserves the database's child RLS role.
const CHILD_LOGIN_EMAIL = "fatima@fatoom-s-journey.app";
const CHILD_AVATARS = ["🌸", "🐰", "🦊", "🐱", "🐼", "🦄", "🐸", "🐥", "🐻", "🦋", "🐨", "🐙", "🐹"];
const toLocalDate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const shortDate = (value: string) => new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

export default function HomePage() {
  const supabase = getSupabase();
  const configured = Boolean(supabase);
  const [sessionUser, setSessionUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [requests, setRequests] = useState<RewardRequest[]>([]);
  const [pointAdjustments, setPointAdjustments] = useState<PointAdjustment[]>([]);
  const [children, setChildren] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMode, setLoginMode] = useState<"child" | "parent">("child");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStars, setTaskStars] = useState("2");
  const [taskCadence, setTaskCadence] = useState<"daily" | "once">("daily");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [rewardName, setRewardName] = useState("");
  const [rewardDescription, setRewardDescription] = useState("");
  const [rewardCost, setRewardCost] = useState("10");
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "tasks" | "rewards" | "history">("home");

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data: myProfile, error: profileError } = await supabase.from("profiles")
        .select("user_id,family_id,role,display_name,avatar_emoji").eq("user_id", userId).single();
      if (profileError) throw new Error("تم تسجيل الدخول، لكن الحساب لم يُربط بالعائلة بعد. أكمل خطوة ربط الحسابين في README.md.");
      const typedProfile = myProfile as Profile;
      setProfile(typedProfile);
      const { data: familyRow, error: familyError } = await supabase.from("families")
        .select("id,name").eq("id", typedProfile.family_id).single();
      if (familyError) throw familyError;
      setFamily(familyRow as Family);

      const [taskResult, completionResult, rewardResult, requestResult, pointResult] = await Promise.all([
        supabase.from("tasks").select("*").eq("family_id", typedProfile.family_id).eq("active", true).order("created_at", { ascending: true }),
        supabase.from("task_completions").select("*").eq("family_id", typedProfile.family_id).order("submitted_at", { ascending: false }).limit(100),
        supabase.from("rewards").select("*").eq("family_id", typedProfile.family_id).eq("active", true).order("stars_cost", { ascending: true }),
        supabase.from("reward_requests").select("*").eq("family_id", typedProfile.family_id).order("requested_at", { ascending: false }).limit(100),
        supabase.from("point_adjustments").select("*").eq("family_id", typedProfile.family_id).order("created_at", { ascending: false }).limit(100),
      ]);
      const queryError = taskResult.error || completionResult.error || rewardResult.error || requestResult.error || pointResult.error;
      if (queryError) throw queryError;
      setTasks((taskResult.data ?? []) as Task[]);
      setCompletions((completionResult.data ?? []) as Completion[]);
      setRewards((rewardResult.data ?? []) as Reward[]);
      setRequests((requestResult.data ?? []) as RewardRequest[]);
      setPointAdjustments((pointResult.data ?? []) as PointAdjustment[]);

      if (typedProfile.role === "parent") {
        const { data: people, error: peopleError } = await supabase.from("profiles")
          .select("user_id,family_id,role,display_name,avatar_emoji").eq("family_id", typedProfile.family_id).eq("role", "child");
        if (peopleError) throw peopleError;
        setChildren((people ?? []) as Profile[]);
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل بيانات العائلة." });
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        setSessionUser({ id: data.session.user.id, email: data.session.user.email });
        void loadData(data.session.user.id);
      } else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setSessionUser({ id: session.user.id, email: session.user.email });
        void loadData(session.user.id);
      } else {
        setSessionUser(null); setProfile(null); setFamily(null); setTasks([]); setCompletions([]); setRewards([]); setRequests([]); setChildren([]); setLoading(false);
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [supabase, loadData]);

  useEffect(() => {
    if (!supabase || !profile) return;
    const channel = supabase.channel(`family-${profile.family_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `family_id=eq.${profile.family_id}` }, () => void loadData(profile.user_id))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_completions", filter: `family_id=eq.${profile.family_id}` }, () => void loadData(profile.user_id))
      .on("postgres_changes", { event: "*", schema: "public", table: "rewards", filter: `family_id=eq.${profile.family_id}` }, () => void loadData(profile.user_id))
      .on("postgres_changes", { event: "*", schema: "public", table: "reward_requests", filter: `family_id=eq.${profile.family_id}` }, () => void loadData(profile.user_id))
      .on("postgres_changes", { event: "*", schema: "public", table: "point_adjustments", filter: `family_id=eq.${profile.family_id}` }, () => void loadData(profile.user_id))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, profile, loadData]);

  const today = toLocalDate();
  const myCompletions = useMemo(() => profile ? completions.filter((item) => item.child_id === profile.user_id) : [], [completions, profile]);
  const todayDone = new Set(myCompletions.filter((item) => item.task_date === today && item.status !== "rejected").map((item) => item.task_id));
  const approvedStars = myCompletions.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.stars_awarded, 0);
  const spentStars = requests.filter((item) => item.status === "approved" && item.child_id === profile?.user_id).reduce((sum, item) => sum + item.stars_cost, 0);
  const totalDeductedPoints = pointAdjustments.filter((item) => item.child_id === profile?.user_id).reduce((sum, item) => sum - item.points, 0);
  const remainingNegativePoints = Math.max(0, totalDeductedPoints - Math.max(0, approvedStars - spentStars));
  const starBalance = Math.max(0, approvedStars - spentStars - totalDeductedPoints);
  const pendingReviews = profile?.role === "parent" ? completions.filter((item) => item.status === "pending") : [];
  const pendingRequests = profile?.role === "parent" ? requests.filter((item) => item.status === "pending") : [];
  const myPendingRequests = requests.filter((item) => item.child_id === profile?.user_id && item.status === "pending");
  const approvedToday = myCompletions.filter((item) => item.task_date === today && item.status === "approved").length;
  const progress = tasks.length ? Math.round((approvedToday / tasks.length) * 100) : 0;
  const greeting = new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginMode === "child" ? CHILD_LOGIN_EMAIL : email.trim(),
      password,
    });
    setBusy(false);
    if (error) setNotice({ kind: "error", text: loginMode === "child" ? "الرمز غير صحيح. جرّبي مرة أخرى." : "تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور." });
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setNotice(null);
  }

  async function saveChildAvatar(avatar: string) {
    if (!supabase || !profile || profile.role !== "child" || avatarSaving) return;
    setAvatarSaving(true);
    const { error } = await supabase.from("profiles").update({ avatar_emoji: avatar }).eq("user_id", profile.user_id);
    setAvatarSaving(false);
    if (error) {
      setNotice({ kind: "error", text: "ما قدرنا نحفظ الصورة الآن. حاولي مرة ثانية." });
      return;
    }
    setProfile({ ...profile, avatar_emoji: avatar });
    setAvatarPickerOpen(false);
    setNotice({ kind: "success", text: "حفظنا شخصيتك الجديدة!" });
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !profile) return;
    const values = { family_id: profile.family_id, title: taskTitle.trim(), description: taskDescription.trim() || null, stars: Number(taskStars), cadence: taskCadence, created_by: profile.user_id };
    const { error } = editingTaskId
      ? await supabase.from("tasks").update(values).eq("id", editingTaskId)
      : await supabase.from("tasks").insert(values);
    if (error) { setNotice({ kind: "error", text: error.message }); return; }
    setEditingTaskId(null); setTaskTitle(""); setTaskDescription(""); setTaskStars("2");
    setNotice({ kind: "success", text: "تم حفظ المهمة." });
    await loadData(profile.user_id);
  }

  async function removeTask(id: string) {
    if (!supabase || !profile || !window.confirm("هل تريد حذف هذه المهمة؟")) return;
    const { error } = await supabase.from("tasks").update({ active: false }).eq("id", id);
    if (error) setNotice({ kind: "error", text: error.message }); else { if (editingTaskId === id) setEditingTaskId(null); await loadData(profile.user_id); }
  }

  function beginEditTask(task: Task) {
    setEditingTaskId(task.id); setTaskTitle(task.title); setTaskDescription(task.description ?? ""); setTaskStars(String(task.stars)); setTaskCadence(task.cadence);
  }

  async function submitTask(task: Task) {
    if (!supabase || !profile) return;
    setBusy(true);
    const { error } = await supabase.from("task_completions").insert({ family_id: profile.family_id, task_id: task.id, child_id: profile.user_id, task_date: today });
    setBusy(false);
    if (error) setNotice({ kind: "error", text: error.code === "23505" ? "تم إرسال هذه المهمة اليوم من قبل." : error.message });
    else { setNotice({ kind: "success", text: "وصل إنجازك لولي الأمر للمراجعة. أحسنتِ!" }); await loadData(profile.user_id); }
  }

  async function reviewCompletion(item: Completion, status: "approved" | "rejected") {
    if (!supabase || !profile) return;
    const { error } = await supabase.from("task_completions").update({ status }).eq("id", item.id);
    if (error) setNotice({ kind: "error", text: error.message });
    else { setNotice({ kind: "success", text: status === "approved" ? "تم اعتماد الإنجاز وإضافة النجوم." : "تمت إعادة الإنجاز للمراجعة." }); await loadData(profile.user_id); }
  }

  async function addReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !profile) return;
    const values = { family_id: profile.family_id, name: rewardName.trim(), description: rewardDescription.trim() || null, stars_cost: Number(rewardCost), created_by: profile.user_id };
    const { error } = editingRewardId
      ? await supabase.from("rewards").update(values).eq("id", editingRewardId)
      : await supabase.from("rewards").insert(values);
    if (error) { setNotice({ kind: "error", text: error.message }); return; }
    setEditingRewardId(null); setRewardName(""); setRewardDescription(""); setRewardCost("10");
    setNotice({ kind: "success", text: "تم حفظ المكافأة." });
    await loadData(profile.user_id);
  }

  function beginEditReward(reward: Reward) {
    setEditingRewardId(reward.id); setRewardName(reward.name); setRewardDescription(reward.description ?? ""); setRewardCost(String(reward.stars_cost));
  }

  async function removeReward(id: string) {
    if (!supabase || !profile || !window.confirm("هل تريد إخفاء هذه المكافأة من القائمة؟")) return;
    const { error } = await supabase.from("rewards").update({ active: false }).eq("id", id);
    if (error) setNotice({ kind: "error", text: error.message }); else { if (editingRewardId === id) setEditingRewardId(null); await loadData(profile.user_id); }
  }

  async function requestReward(reward: Reward) {
    if (!supabase || !profile) return;
    const { error } = await supabase.from("reward_requests").insert({ family_id: profile.family_id, child_id: profile.user_id, reward_id: reward.id });
    if (error) setNotice({ kind: "error", text: error.message.includes("stars") ? "نجومك ما تكفي لهذه المكافأة بعد." : error.message });
    else { setNotice({ kind: "success", text: "وصل طلب المكافأة لولي الأمر." }); await loadData(profile.user_id); }
  }

  async function recordBehaviorPoint(behavior: string, points: number) {
    if (!supabase || !profile || profile.role !== "parent") return;
    const child = children.find((person) => person.role === "child");
    if (!child) { setNotice({ kind: "error", text: "ما لقينا حساب فاطمة ضمن العائلة." }); return; }
    const { error } = await supabase.from("point_adjustments").insert({
      family_id: profile.family_id, child_id: child.user_id, points, behavior: behavior.trim(), created_by: profile.user_id,
    });
    if (error) { setNotice({ kind: "error", text: "ما قدرنا نسجل الملاحظة. حاولي مرة ثانية." }); return; }
    setNotice({ kind: "success", text: `تم تسجيل ${points} ${points === -1 ? "نقطة" : "نقطتين"} للمراجعة مع فاطمة.` });
    await loadData(profile.user_id);
  }

  async function reviewReward(request: RewardRequest, status: "approved" | "rejected") {
    if (!supabase || !profile) return;
    const { error } = await supabase.from("reward_requests").update({ status }).eq("id", request.id);
    if (error) setNotice({ kind: "error", text: error.message });
    else { setNotice({ kind: "success", text: status === "approved" ? "تم اعتماد المكافأة." : "تم رفض الطلب." }); await loadData(profile.user_id); }
  }

  const taskMap = useMemo(() => new Map(tasks.map((item) => [item.id, item])), [tasks]);
  const rewardMap = useMemo(() => new Map(rewards.map((item) => [item.id, item])), [rewards]);
  const childMap = useMemo(() => new Map(children.map((item) => [item.user_id, item])), [children]);
  const childStars = (childId: string) => {
    const earned = completions.filter((item) => item.child_id === childId && item.status === "approved").reduce((sum, item) => sum + item.stars_awarded, 0);
    const spent = requests.filter((item) => item.child_id === childId && item.status === "approved").reduce((sum, item) => sum + item.stars_cost, 0);
    const deducted = pointAdjustments.filter((item) => item.child_id === childId).reduce((sum, item) => sum - item.points, 0);
    return Math.max(0, earned - spent - deducted);
  };
  const childDeductions = (childId: string) => {
    const earned = completions.filter((item) => item.child_id === childId && item.status === "approved").reduce((sum, item) => sum + item.stars_awarded, 0);
    const spent = requests.filter((item) => item.child_id === childId && item.status === "approved").reduce((sum, item) => sum + item.stars_cost, 0);
    const deducted = pointAdjustments.filter((item) => item.child_id === childId).reduce((sum, item) => sum - item.points, 0);
    return Math.max(0, deducted - Math.max(0, earned - spent));
  };
  if (!configured) return <SetupScreen />;
  if (loading) return <div className="screen-center"><div className="loading-mark"><Sparkles size={24} /></div><p>نجهز عالم فاطمة...</p></div>;
  if (!sessionUser) return <LoginScreen mode={loginMode} setMode={(mode) => { setLoginMode(mode); setPassword(""); setNotice(null); }} email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={signIn} notice={notice} busy={busy} />;
  if (!profile) return <AccountSetupScreen notice={notice} onSignOut={signOut} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#الرئيسية"><span className="brand-icon"><Sparkles size={24} /></span><span><b>رحلة فاطمة</b><small>كل يوم حكاية إنجاز</small></span></a>
        <div className="family-pill"><span className="family-avatar">{profile.role === "parent" ? <ShieldCheck size={18} /> : <Baby size={18} />}</span><span><b>{profile.display_name}</b><small>{profile.role === "parent" ? "لوحة ولي الأمر" : "عالم فاطمة"}</small></span></div>
        <nav className="side-nav" aria-label="التنقل الرئيسي">
          <button className={activeTab === "home" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("home")}><Home size={19} />الرئيسية<ChevronLeft size={16} /></button>
          <button className={activeTab === "tasks" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("tasks")}><BookOpenCheck size={19} />المهام<ChevronLeft size={16} /></button>
          <button className={activeTab === "rewards" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("rewards")}><Gift size={19} />المكافآت<ChevronLeft size={16} /></button>
          <button className={activeTab === "history" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("history")}><CalendarDays size={19} />سجل الإنجازات<ChevronLeft size={16} /></button>
        </nav>
        <div className="sidebar-note"><span className="note-sparkle">✦</span><b>خطوة صغيرة كل يوم</b><p>تصنع إنجازًا كبيرًا مع الوقت.</p><span className="note-stars">✦ ✧ ✦</span></div>
        <button className="logout-button" onClick={signOut}><LogOut size={18} />تسجيل الخروج</button>
      </aside>

      <section className="main-column">
        <header className="topbar"><div className="breadcrumbs"><span>رحلة فاطمة</span><ChevronLeft size={15} /><b>{profile.role === "parent" ? "لوحة ولي الأمر" : "مساحتي"}</b></div><div className="topbar-actions"><span className="connection-chip"><span />متصل بالعائلة</span><button className="icon-button" aria-label="تحديث البيانات" onClick={() => loadData(profile.user_id)}><RefreshCw size={18} /></button><button className="topbar-logout" type="button" onClick={signOut} title="تسجيل الخروج"><LogOut size={16} /><span>خروج</span></button>{profile.role === "child" ? <div className="avatar-control"><button className="top-avatar child-avatar" type="button" onClick={() => setAvatarPickerOpen((open) => !open)} aria-label="تغيير الصورة الرمزية" aria-expanded={avatarPickerOpen} title="اضغطي لتغيير صورتك">{profile.avatar_emoji || "🌸"}<span className="avatar-edit-badge"><Pencil size={10} /></span></button>{avatarPickerOpen && <div className="avatar-picker" role="dialog" aria-label="اختاري صورتك الرمزية"><b>اختاري شخصيتك</b><span>تقدرين تغيرينها بأي وقت</span><div className="avatar-choice-grid">{CHILD_AVATARS.map((avatar) => <button key={avatar} type="button" className={profile.avatar_emoji === avatar ? "avatar-choice selected" : "avatar-choice"} aria-label={`اختيار ${avatar}`} aria-pressed={profile.avatar_emoji === avatar} disabled={avatarSaving} onClick={() => void saveChildAvatar(avatar)}>{avatar}</button>)}</div>{avatarSaving && <small>جارٍ الحفظ...</small>}</div>}</div> : <div className="top-avatar">{profile.display_name.slice(0, 1)}</div>}</div></header>
        <div className="page-content">
          {notice && <div className={`notice ${notice.kind}`}><span>{notice.text}</span><button aria-label="إغلاق" onClick={() => setNotice(null)}><X size={16} /></button></div>}
          {activeTab === "home" && (profile.role === "parent"
            ? <ParentHome family={family} profile={profile} familyChildren={children} completions={completions} tasks={tasks} pendingReviews={pendingReviews} pendingRequests={pendingRequests} pointAdjustments={pointAdjustments} taskMap={taskMap} rewardMap={rewardMap} childMap={childMap} childStars={childStars} childDeductions={childDeductions} onReviewCompletion={reviewCompletion} onReviewReward={reviewReward} onRecordBehavior={recordBehaviorPoint} />
            : <ChildHome profile={profile} greeting={greeting} tasks={tasks} completions={myCompletions} todayDone={todayDone} rewards={rewards} requests={myPendingRequests} starBalance={starBalance} approvedStars={approvedStars} deductedPoints={remainingNegativePoints} progress={progress} busy={busy} onSubmitTask={submitTask} onRequestReward={requestReward} />)}
          {activeTab === "tasks" && <section className="section-block"><div className="section-heading"><div><p className="eyebrow">{profile.role === "parent" ? "إدارة الروتين" : "خطوات يومي"}</p><h1>{profile.role === "parent" ? "مهام فاطمة" : "مهامي اليوم"}</h1><p className="section-subtitle">{profile.role === "parent" ? "أضف مهامًا صغيرة تصنع فرقًا كبيرًا." : "كل مهمة تنجزينها تقربك من مكافأتك."}</p></div><span className="heading-icon lavender"><BookOpenCheck size={23} /></span></div>
            <div className="task-layout"><div className="task-list">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} child={profile.role === "child"} todayDone={todayDone.has(task.id)} completion={myCompletions.find((item) => item.task_id === task.id && item.task_date === today)} onSubmit={() => submitTask(task)} onEdit={() => beginEditTask(task)} onDelete={() => removeTask(task.id)} busy={busy} />) : <EmptyState icon={<BookOpenCheck />} title="ما فيه مهام مضافة" text="أضفوا أول مهمة عشان تبدأ رحلة الإنجاز." />}</div>
              {profile.role === "parent" && <form className="form-card compact-form" onSubmit={addTask}><div className="form-title"><span className="form-icon pink">{editingTaskId ? <Pencil size={17} /> : <Plus size={18} />}</span><div><h3>{editingTaskId ? "تعديل المهمة" : "مهمة جديدة"}</h3><p>خلوها واضحة ومناسبة لعمر فاطمة.</p></div></div><label>اسم المهمة<input required maxLength={80} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="مثال: ترتيب الألعاب" /></label><label>تفاصيل بسيطة<textarea rows={2} maxLength={180} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="وش المطلوب؟" /></label><div className="form-row"><label>النجوم<input type="number" required min="1" max="100" value={taskStars} onChange={(e) => setTaskStars(e.target.value)} /></label><label>التكرار<select value={taskCadence} onChange={(e) => setTaskCadence(e.target.value as "daily" | "once")}><option value="daily">يومي</option><option value="once">مرة واحدة</option></select></label></div><button className="primary-button full-button" type="submit">{editingTaskId ? "حفظ التعديلات" : <><Plus size={17} />إضافة المهمة</>}</button>{editingTaskId && <button className="cancel-edit" type="button" onClick={() => { setEditingTaskId(null); setTaskTitle(""); setTaskDescription(""); }}>إلغاء التعديل</button>}</form>}
            </div>
          </section>}
          {activeTab === "rewards" && <section className="section-block"><div className="section-heading"><div><p className="eyebrow">{profile.role === "parent" ? "أشياء تفرحها" : "أحلامي الصغيرة"}</p><h1>متجر المكافآت</h1><p className="section-subtitle">{profile.role === "parent" ? "حددوا مكافآت تحبها فاطمة وقيمة كل واحدة." : `معك ${starBalance} نجمة. اختاري مكافأة تحبينها.`}</p></div><span className="heading-icon peach"><Gift size={23} /></span></div>
            <div className="reward-layout"><div className="reward-grid">{rewards.length ? rewards.map((reward, index) => <RewardCard key={reward.id} reward={reward} child={profile.role === "child"} canAfford={starBalance >= reward.stars_cost} pending={myPendingRequests.some((request) => request.reward_id === reward.id)} color={index % 4} onRequest={() => requestReward(reward)} onEdit={profile.role === "parent" ? () => beginEditReward(reward) : undefined} onDelete={profile.role === "parent" ? () => removeReward(reward.id) : undefined} />) : <EmptyState icon={<Gift />} title="قائمة المكافآت فاضية" text="أضيفوا أشياء ممتعة تكون هدفًا للنجوم." />}</div>
              {profile.role === "parent" && <form className="form-card compact-form" onSubmit={addReward}><div className="form-title"><span className="form-icon peach">{editingRewardId ? <Pencil size={17} /> : <Gift size={18} />}</span><div><h3>{editingRewardId ? "تعديل المكافأة" : "مكافأة جديدة"}</h3><p>اختاروا هدفًا يسعد فاطمة.</p></div></div><label>اسم المكافأة<input required maxLength={80} value={rewardName} onChange={(e) => setRewardName(e.target.value)} placeholder="مثال: وقت قصة إضافي" /></label><label>وصف<textarea rows={2} maxLength={180} value={rewardDescription} onChange={(e) => setRewardDescription(e.target.value)} placeholder="تفاصيل المكافأة" /></label><label>كم نجمة تحتاج؟<input type="number" required min="1" max="1000" value={rewardCost} onChange={(e) => setRewardCost(e.target.value)} /></label><button className="primary-button full-button" type="submit">{editingRewardId ? "حفظ التعديلات" : <><Plus size={17} />إضافة المكافأة</>}</button>{editingRewardId && <button className="cancel-edit" type="button" onClick={() => { setEditingRewardId(null); setRewardName(""); setRewardDescription(""); }}>إلغاء التعديل</button>}</form>}
            </div>
            {profile.role === "parent" && <div className="request-panel"><div className="inline-heading"><h2>طلبات المكافآت</h2><span className="count-badge">{pendingRequests.length}</span></div>{pendingRequests.length ? pendingRequests.map((item) => <RewardRequestRow key={item.id} request={item} childName={childMap.get(item.child_id)?.display_name ?? "فاطمة"} reward={rewardMap.get(item.reward_id)} onApprove={() => reviewReward(item, "approved")} onReject={() => reviewReward(item, "rejected")} />) : <p className="empty-inline">ما فيه طلبات بانتظار المراجعة.</p>}</div>}
          </section>}
          {activeTab === "history" && <HistoryView profile={profile} completions={profile.role === "parent" ? completions : myCompletions} tasks={tasks} childMap={childMap} />}
          {busy && <div className="sync-caption"><RefreshCw size={14} />جارٍ مزامنة بيانات العائلة...</div>}
        </div>
      </section>
    </main>
  );
}

function LoginScreen({ mode, setMode, email, setEmail, password, setPassword, onSubmit, notice, busy }: { mode: "child" | "parent"; setMode: (v: "child" | "parent") => void; email: string; setEmail: (v: string) => void; password: string; setPassword: (v: string) => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; notice: Notice; busy: boolean }) {
  return <main className="login-screen"><div className="login-decor decor-one" /><div className="login-decor decor-two" /><section className="login-card"><div className="login-brand"><span className="login-logo"><Sparkles size={28} /></span><p className="eyebrow">مساحة عائلتكم الخاصة</p><h1>رحلة فاطمة</h1><p className="login-subtitle">كل يوم مليان فرص صغيرة للإنجاز والفرح.</p></div>
    <div className="login-illustration"><span className="cloud cloud-a" /><span className="cloud cloud-b" /><span className="sun-face">☀</span><JourneyMascot variant="login" /><div className="illustration-caption"><span>✦</span><b>خطوة بخطوة، توصلين!</b><span>✦</span></div></div>
    <form className="login-form" onSubmit={onSubmit}><div className="login-form-head"><h2>{mode === "child" ? "هلا يا فاطمة!" : "أهلًا بولي الأمر"}</h2><p>{mode === "child" ? "اكتبي رمزك السري عشان ندخل عالمك" : "سجّل الدخول لإدارة رحلة فاطمة"}</p></div><div className="login-mode-switch" role="group" aria-label="نوع تسجيل الدخول"><button type="button" className={mode === "child" ? "selected" : ""} aria-pressed={mode === "child"} onClick={() => setMode("child")}>دخول فاطمة</button><button type="button" className={mode === "parent" ? "selected" : ""} aria-pressed={mode === "parent"} onClick={() => setMode("parent")}>ولي الأمر</button></div>{notice && <div className={`notice ${notice.kind}`}><span>{notice.text}</span></div>}{mode === "parent" && <label>البريد الإلكتروني<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></label>}<label>{mode === "child" ? "رمز الدخول · ٦ أرقام" : "كلمة المرور"}<input type="password" required autoComplete={mode === "child" ? "off" : "current-password"} inputMode={mode === "child" ? "numeric" : "text"} pattern={mode === "child" ? "[0-9]{6}" : undefined} minLength={mode === "child" ? 6 : undefined} maxLength={mode === "child" ? 6 : undefined} value={password} onChange={(e) => setPassword(mode === "child" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)} placeholder={mode === "child" ? "● ● ● ● ● ●" : "••••••••"} dir="ltr" /></label><button className="primary-button full-button login-submit" disabled={busy || (mode === "child" && password.length !== 6)} type="submit">{busy ? "جارٍ الدخول..." : "دخول إلى رحلتي"}<ArrowLeft size={18} /></button><div className="login-foot"><ShieldCheck size={15} />الدخول مخصص لأفراد العائلة فقط</div></form>
  </section><p className="login-footer">مصممة بحب لفاطمة <Heart size={14} fill="currentColor" /></p></main>;
}

function SetupScreen() {
  return <main className="setup-screen"><div className="setup-card"><span className="setup-icon"><CircleHelp size={26} /></span><p className="eyebrow">خطوة التوصيل الأولى</p><h1>نحتاج نوصل الموقع بقاعدة البيانات</h1><p>أضف إعدادات Supabase إلى ملف <code>.env.local</code> ليتفعّل تسجيل الدخول والحفظ والمزامنة بين الأجهزة.</p><ol><li>أنشئ مشروعًا في Supabase.</li><li>انسخ رابط المشروع و<strong>Publishable key</strong>.</li><li>ضعهما في ملف <code>.env.local</code> بجانب <code>package.json</code> ثم شغّل الموقع من جديد.</li></ol><div className="env-code">NEXT_PUBLIC_SUPABASE_URL=رابط-مشروعك<br />NEXT_PUBLIC_SUPABASE_ANON_KEY=مفتاح-النشر</div><p className="setup-note">ستجد خطوات إعداد قاعدة البيانات والحسابات في ملف <code>README.md</code>.</p></div></main>;
}

function AccountSetupScreen({ notice, onSignOut }: { notice: Notice; onSignOut: () => void }) {
  return <main className="setup-screen"><div className="setup-card"><span className="setup-icon"><ShieldCheck size={26} /></span><p className="eyebrow">الحساب يحتاج ربطًا</p><h1>باقي خطوة ونبدأ الرحلة</h1><p>{notice?.text ?? "هذا الحساب لم يُربط بملف العائلة بعد."}</p><ol><li>افتح README.md واتبع خطوة إعداد حساب ولي الأمر وحساب فاطمة.</li><li>بعد ربط الحساب، سجّل الخروج ثم ادخل مرة ثانية.</li></ol><button className="primary-button" onClick={onSignOut}><LogOut size={16} />تسجيل الخروج</button></div></main>;
}

function JourneyMascot({ variant }: { variant: "login" | "parent" | "child" }) {
  return (
    <svg className={`journey-mascot mascot-${variant}`} viewBox="0 0 240 220" aria-hidden="true" focusable="false">
      <ellipse cx="116" cy="205" rx="73" ry="10" fill="#776bb0" opacity=".12" />
      <g className="mascot-bunny">
        <path d="M87 83C64 63 66 26 77 18c13-9 28 21 34 50M140 69c7-33 25-58 37-50 12 8 6 44-15 67" fill="#fff9f2" stroke="#c99ab5" strokeWidth="4" strokeLinecap="round" />
        <path d="M84 65c-9-14-10-31-7-39 9 8 15 20 19 33m48 0c5-18 13-30 20-35 2 12-2 26-10 39" fill="#f2bfd0" />
        <path d="M72 143c-5 13-2 33 10 42 19 15 54 18 76 4 14-9 17-28 10-44" fill="#e5dcff" stroke="#c5b8ec" strokeWidth="3" />
        <path d="M77 137c-15 2-22 17-14 27 6 8 18 6 26-1m77-27c15 2 22 17 14 27-6 8-18 6-26-1" fill="#fff9f2" stroke="#c99ab5" strokeWidth="3" strokeLinecap="round" />
        <circle cx="117" cy="101" r="46" fill="#fff9f2" stroke="#c99ab5" strokeWidth="3" />
        <path d="M77 101c2-24 21-42 43-42 22 0 39 15 43 37-12-4-22-12-29-23-12 13-33 22-57 28Z" fill="#f0b9cb" />
        <circle cx="101" cy="108" r="3.6" fill="#61566d" /><circle cx="132" cy="108" r="3.6" fill="#61566d" />
        <ellipse cx="92" cy="119" rx="8" ry="4.5" fill="#f0b4c3" opacity=".8" /><ellipse cx="141" cy="119" rx="8" ry="4.5" fill="#f0b4c3" opacity=".8" />
        <path d="M114 117q3-5 7 0q-1 5-4 6q-3-1-3-6Zm3 7q-6 8-11 2m11-2q6 8 11 2" fill="none" stroke="#8b6679" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M99 177q18-14 37 0" fill="none" stroke="#c2b4e9" strokeWidth="3" strokeLinecap="round" />
        <circle cx="117" cy="160" r="7" fill="#fff7d9" />
      </g>
      <g className="mascot-wand">
        <path d="m166 90 18 37" stroke="#bd9c66" strokeWidth="3" strokeLinecap="round" />
        <path d="m184 70 5 11 12 1-9 8 3 12-11-6-10 6 2-12-9-8 12-1Z" fill="#ffd978" stroke="#e8b94d" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="176" cy="113" r="2.5" fill="#f2c86a" />
      </g>
      <g className="mascot-star-friend">
        <path d="m49 125 5 11 12 1-9 8 3 12-11-6-10 6 2-12-9-8 12-1Z" fill="#ffe08b" stroke="#eac45f" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="47" cy="143" r="1.5" fill="#746480" /><circle cx="55" cy="143" r="1.5" fill="#746480" />
        <path d="M48 148q3 3 6 0" fill="none" stroke="#9c7180" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <path className="mascot-twinkle twinkle-one" d="m204 131 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#fff" />
      <path className="mascot-twinkle twinkle-two" d="m43 82 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff" />
    </svg>
  );
}

function ParentHome({ family, profile, familyChildren, completions, tasks, pendingReviews, pendingRequests, pointAdjustments, taskMap, rewardMap, childMap, childStars, childDeductions, onReviewCompletion, onReviewReward, onRecordBehavior }: { family: Family | null; profile: Profile; familyChildren: Profile[]; completions: Completion[]; tasks: Task[]; pendingReviews: Completion[]; pendingRequests: RewardRequest[]; pointAdjustments: PointAdjustment[]; taskMap: Map<string, Task>; rewardMap: Map<string, Reward>; childMap: Map<string, Profile>; childStars: (id: string) => number; childDeductions: (id: string) => number; onReviewCompletion: (item: Completion, status: "approved" | "rejected") => void; onReviewReward: (item: RewardRequest, status: "approved" | "rejected") => void; onRecordBehavior: (behavior: string, points: number) => void }) {
  const recent = completions.slice(0, 4);
  const [behavior, setBehavior] = useState("رفع الصوت أو الكلام الجارح بعد التنبيه");
  const [behaviorPoints, setBehaviorPoints] = useState("-1");
  function submitBehavior(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRecordBehavior(behavior, Number(behaviorPoints));
  }
  return <><section className="welcome-banner parent-banner"><div className="welcome-copy"><p className="eyebrow">{new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>أهلًا {profile.display_name} <span>☀️</span></h1><p>رحلة {family?.name ?? "العائلة"} مليانة إنجازات جميلة. هذا ملخصكم اليوم.</p><div className="banner-tags"><span><Heart size={14} fill="currentColor" />معًا كل يوم</span><span><Sparkles size={14} />أحلام صغيرة وإنجازات كبيرة</span></div></div><div className="banner-art parent-art"><span className="parent-stars">✦　✧　✦</span><span className="parent-doodle">♡</span><JourneyMascot variant="parent" /></div></section>
    <div className="stats-grid parent-stats"><StatCard icon={<Clock3 />} tone="peach" label="إنجازات بانتظارك" value={pendingReviews.length} hint="مراجعة المهام" /><StatCard icon={<Gift />} tone="lavender" label="طلبات مكافآت" value={pendingRequests.length} hint="بانتظار قرارك" /><StatCard icon={<BookOpenCheck />} tone="mint" label="المهام النشطة" value={tasks.length} hint="في قائمة فاطمة" /><StatCard icon={<Star fill="currentColor" />} tone="yellow" label="نجوم فاطمة" value={childStars(familyChildren[0]?.user_id ?? "")} hint="رصيدها الحالي" /></div>
    <div className="parent-dashboard-grid"><section className="panel review-panel"><div className="panel-heading"><div><p className="eyebrow">دورك الآن</p><h2>مراجعة الإنجازات</h2></div><span className="heading-icon peach"><CheckCheck size={21} /></span></div>{pendingReviews.length ? <div className="review-list">{pendingReviews.slice(0, 5).map((item) => <CompletionReviewRow key={item.id} item={item} task={taskMap.get(item.task_id)} childName={childMap.get(item.child_id)?.display_name ?? "فاطمة"} onApprove={() => onReviewCompletion(item, "approved")} onReject={() => onReviewCompletion(item, "rejected")} />)}</div> : <div className="calm-empty"><span>🌷</span><b>كل شيء مراجع!</b><p>الإنجازات الجديدة بتظهر هنا.</p></div>}</section>
      <section className="panel week-panel"><div className="panel-heading"><div><p className="eyebrow">نبض الرحلة</p><h2>هذا الأسبوع</h2></div><span className="heading-icon mint"><Trophy size={20} /></span></div><div className="week-summary"><b>{completions.filter((item) => item.status === "approved").length}</b><span>إنجاز معتمد<br />حتى الآن</span></div><div className="mini-week">{Array.from({ length: 7 }, (_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - (6 - i)); const date = toLocalDate(dt); const count = completions.filter((item) => item.task_date === date && item.status === "approved").length; return <div className="week-day" key={date}><div className="bar-track"><span style={{ height: `${count ? Math.min(100, 28 + count * 25) : 8}%` }} className={count ? "bar-filled" : "bar-empty"} /></div><small>{weekdayNames[dt.getDay()].slice(0, 1)}</small></div>; })}</div><p className="chart-caption">الإنجازات المعتمدة خلال آخر ٧ أيام</p></section></div>
    <section className="panel behavior-panel"><div className="panel-heading"><div><p className="eyebrow">توجيه بهدوء</p><h2>ملاحظة على تصرف متكرر</h2></div><span className="behavior-total">−{childDeductions(familyChildren[0]?.user_id ?? "")}</span></div><p className="behavior-guidance">سجّلوا نقطة أو نقطتين عند تكرار التصرف بعد التنبيه. نحاسب على التصرف، مو على شعور الغضب.</p><form className="behavior-form" onSubmit={submitBehavior}><label>التصرف<select value={behavior} onChange={(event) => setBehavior(event.target.value)}><option>رفع الصوت أو الكلام الجارح بعد التنبيه</option><option>رفض ترتيب المكان بعد التذكير</option><option>مقاطعة الآخرين أو عدم احترام الدور</option></select></label><label>النقاط<select value={behaviorPoints} onChange={(event) => setBehaviorPoints(event.target.value)}><option value="-1">−١ نقطة</option><option value="-2">−٢ نقطتين</option></select></label><button className="negative-button" type="submit"><X size={16} />تسجيل ملاحظة حمراء</button></form>{pointAdjustments.length > 0 && <div className="behavior-history"><b>آخر الملاحظات</b>{pointAdjustments.slice(0, 3).map((item) => <div className="behavior-history-row" key={item.id}><span>{item.behavior}<small>{shortDate(item.created_at.slice(0, 10))}</small></span><strong>{item.points}</strong></div>)}</div>}</section>
    <section className="panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">آخر الأخبار</p><h2>من رحلة فاطمة</h2></div><span className="heading-icon lavender"><Sparkles size={20} /></span></div>{recent.length ? <div className="activity-list">{recent.map((item) => <ActivityRow key={item.id} item={item} task={taskMap.get(item.task_id)} childName={childMap.get(item.child_id)?.display_name ?? "فاطمة"} />)}</div> : <div className="calm-empty slim"><span>✨</span><p>أول إنجاز بيبدأ الحكاية هنا.</p></div>}</section>
    <div className="request-inline-panel"><div className="inline-heading"><h2>طلبات المكافآت</h2><span className="count-badge">{pendingRequests.length}</span></div>{pendingRequests.length ? pendingRequests.slice(0, 3).map((item) => <RewardRequestRow key={item.id} request={item} childName={childMap.get(item.child_id)?.display_name ?? "فاطمة"} reward={rewardMap.get(item.reward_id)} onApprove={() => onReviewReward(item, "approved")} onReject={() => onReviewReward(item, "rejected")} />) : <p className="empty-inline">ما فيه طلبات جديدة. فاطمة تجمع نجومها الآن.</p>}</div>
  </>;
}

function ChildHome({ profile, greeting, tasks, completions, todayDone, rewards, requests, starBalance, approvedStars, deductedPoints, progress, busy, onSubmitTask, onRequestReward }: { profile: Profile; greeting: string; tasks: Task[]; completions: Completion[]; todayDone: Set<string>; rewards: Reward[]; requests: RewardRequest[]; starBalance: number; approvedStars: number; deductedPoints: number; progress: number; busy: boolean; onSubmitTask: (task: Task) => void; onRequestReward: (reward: Reward) => void }) {
  const availableTasks = tasks.filter((task) => task.cadence !== "once" || !completions.some((item) => item.task_id === task.id && item.status === "approved"));
  const readyTasks = availableTasks.filter((task) => !todayDone.has(task.id));
  const nearest = rewards.find((item) => starBalance < item.stars_cost);
  return <><section className="welcome-banner child-banner"><div className="welcome-copy"><p className="eyebrow">{greeting}</p><h1>يا هلا يا {profile.display_name} <span>🌸</span></h1><p>كل إنجاز منك يضيف نجمة لحكايتك. مستعدة لمغامرة اليوم؟</p><div className="banner-tags"><span><Sparkles size={14} />أنتِ قدها</span><span><Heart size={14} fill="currentColor" />نحب نشوف إنجازاتك</span></div></div><div className="banner-art child-art"><span className="doodle-star star-a">✦</span><span className="doodle-star star-b">✧</span><span className="doodle-star star-c">✦</span><span className="art-ground" /><JourneyMascot variant="child" /></div></section>
    <div className="stats-grid child-stats"><StatCard icon={<Star fill="currentColor" />} tone="yellow" label="نجومي" value={starBalance} hint="جاهزة للمكافآت" /><StatCard icon={<CheckCircle2 />} tone="mint" label="إنجازاتي" value={approvedStars ? completions.filter((item) => item.status === "approved").length : 0} hint="مهمة معتمدة" /><StatCard icon={<Trophy />} tone="lavender" label="مستواي" value={starBalance >= 30 ? "متألقة" : starBalance >= 12 ? "نجمة" : "بدايتي"} hint="كل نجمة تقربك" /></div>{deductedPoints > 0 && <div className="child-deduction-banner"><span>−{deductedPoints} نقطة</span><small>تقدرين تعوضينها بإنجازات جديدة 🌱</small></div>}
    <section className="panel progress-panel"><div className="progress-copy"><span className="progress-icon"><Sparkles size={19} /></span><div><p className="eyebrow">مغامرة اليوم</p><h2>خطواتك نحو إنجاز اليوم</h2><p>{todayDone.size} من {tasks.length} مهام وصلت لولي الأمر</p></div></div><div className="progress-meter"><div className="progress-label"><span>تقدمك</span><b>{progress}%</b></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div></section>
    <div className="child-content-grid"><section className="panel tasks-panel"><div className="panel-heading"><div><p className="eyebrow">أول خطوة تبدأ الآن</p><h2>مهام اليوم <span className="count-badge">{readyTasks.length}</span></h2></div><span className="heading-icon lavender"><BookOpenCheck size={21} /></span></div>{availableTasks.length ? <div className="child-task-list">{availableTasks.map((task, index) => <TaskRow key={task.id} task={task} child todayDone={todayDone.has(task.id)} completion={completions.find((item) => item.task_id === task.id && item.task_date === toLocalDate())} onSubmit={() => onSubmitTask(task)} onDelete={() => {}} busy={busy} compact index={index} />)}</div> : <EmptyState icon={<BookOpenCheck />} title="يومك فاضي من المهام" text="اسألي ولي أمرك عن أول مغامرة!" />}</section>
      <div className="child-side-stack"><section className="panel star-panel"><div className="star-medallion"><Star size={28} fill="currentColor" /></div><p className="eyebrow">رصيدك الحلو</p><h2>{starBalance} <small>نجمة</small></h2><p>حافظي على حماسك، مكافأتك أقرب مما تتخيلين!</p>{nearest && <div className="next-reward"><span>المكافأة التالية</span><b>{nearest.name} <span>· {nearest.stars_cost - starBalance} نجمة</span></b><div className="progress-track small"><span style={{ width: `${Math.min(100, Math.round((starBalance / nearest.stars_cost) * 100))}%` }} /></div></div>}</section>
        <section className="panel quick-reward"><div className="panel-heading"><div><p className="eyebrow">اختاري هدفك</p><h2>مكافآت قريبة</h2></div><Gift size={19} className="muted-icon" /></div>{rewards.slice(0, 2).map((reward, i) => <div className="quick-reward-row" key={reward.id}><span className={`reward-emoji reward-${i}`}>{i ? "🎨" : "📖"}</span><span><b>{reward.name}</b><small>{reward.stars_cost} نجمة</small></span><button className="round-arrow" disabled={starBalance < reward.stars_cost || requests.some((r) => r.reward_id === reward.id)} aria-label={`طلب ${reward.name}`} onClick={() => onRequestReward(reward)}><ChevronLeft size={17} /></button></div>)}</section></div></div>
    <div className="child-note"><span>🌈</span><p><b>تذكري:</b> كل محاولة تستحق التصفيق، مو بس النتيجة. أنتِ مبدعة!</p><span>✦</span></div>
  </>;
}

function HistoryView({ profile, completions, tasks, childMap }: { profile: Profile; completions: Completion[]; tasks: Task[]; childMap: Map<string, Profile> }) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const list = completions.slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return <section className="section-block"><div className="section-heading"><div><p className="eyebrow">ذكريات الإنجاز</p><h1>سجل الرحلة</h1><p className="section-subtitle">كل خطوة تستحق أن نتذكرها.</p></div><span className="heading-icon mint"><CalendarDays size={22} /></span></div><div className="panel history-panel">{list.length ? list.map((item) => <div className="history-row" key={item.id}><span className={`history-state ${item.status}`}>{item.status === "approved" ? <Check size={17} /> : item.status === "rejected" ? <X size={16} /> : <Clock3 size={16} />}</span><div className="history-main"><b>{taskMap.get(item.task_id)?.title ?? "مهمة"}</b><small>{profile.role === "parent" ? `${childMap.get(item.child_id)?.display_name ?? "فاطمة"} · ` : ""}{shortDate(item.task_date)}</small></div><span className="status-text">{item.status === "approved" ? `+${item.stars_awarded} نجمة` : item.status === "pending" ? "بانتظار المراجعة" : "تحتاج المحاولة مرة ثانية"}</span></div>) : <EmptyState icon={<CalendarDays />} title="لسه ما عندنا إنجازات" text="بداية جميلة تنتظركم قريبًا." />}</div></section>;
}

function TaskRow({ task, child, todayDone, completion, onSubmit, onEdit, onDelete, busy, compact = false, index = 0 }: { task: Task; child: boolean; todayDone: boolean; completion?: Completion; onSubmit: () => void; onEdit?: () => void; onDelete: () => void; busy: boolean; compact?: boolean; index?: number }) {
  const pending = completion?.status === "pending";
  const rejected = completion?.status === "rejected";
  return <div className={`task-row ${compact ? "compact" : ""}`}><span className={`task-check tone-${index % 4}`}>{todayDone ? <Check size={18} /> : <BookOpenCheck size={18} />}</span><div className="task-info"><b>{task.title}</b>{task.description && <small>{task.description}</small>}<span className="task-meta">{task.cadence === "daily" ? "مهمة يومية" : "مرة واحدة"} <span>·</span> <Star size={12} fill="currentColor" /> {task.stars} نجوم</span></div>{child ? (todayDone ? <span className={`task-status ${completion?.status ?? "approved"}`}>{pending ? "بانتظار المراجعة" : "أُنجزت اليوم"}</span> : <button className="task-action" disabled={busy} onClick={onSubmit}>{rejected ? "إعادة الإرسال" : "أتممتها"}<Check size={16} /></button>) : <div className="manager-actions"><button className="icon-button edit-icon" aria-label={`تعديل ${task.title}`} onClick={onEdit}><Pencil size={15} /></button><button className="icon-button danger-icon" aria-label={`حذف ${task.title}`} onClick={onDelete}><Trash2 size={15} /></button></div>}</div>;
}

function RewardCard({ reward, child, canAfford, pending, color, onRequest, onEdit, onDelete }: { reward: Reward; child: boolean; canAfford: boolean; pending: boolean; color: number; onRequest: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const emojis = ["📚", "🎨", "🧸", "🍓"];
  return <article className={`reward-card reward-tone-${color}`}><span className="reward-card-icon">{emojis[color]}</span><div className="reward-card-content"><h3>{reward.name}</h3><p>{reward.description || "مكافأة جميلة تنتظرك."}</p><div className="reward-card-bottom"><span className="cost-chip"><Star size={14} fill="currentColor" />{reward.stars_cost} نجمة</span>{child ? <button className="text-action" disabled={!canAfford || pending} onClick={onRequest}>{pending ? "بانتظار الموافقة" : canAfford ? "أطلبها" : "اجمعي أكثر"}<ChevronLeft size={14} /></button> : <div className="manager-actions"><button className="icon-button edit-icon" aria-label={`تعديل ${reward.name}`} onClick={onEdit}><Pencil size={14} /></button><button className="icon-button danger-icon" aria-label={`إخفاء ${reward.name}`} onClick={onDelete}><Trash2 size={14} /></button></div>}</div></div></article>;
}

function CompletionReviewRow({ item, task, childName, onApprove, onReject }: { item: Completion; task?: Task; childName: string; onApprove: () => void; onReject: () => void }) {
  return <div className="review-row"><span className="review-avatar">{childName.slice(0, 1)}</span><div className="review-info"><b>{task?.title ?? "مهمة"}</b><small>{childName} · {shortDate(item.task_date)} · {task?.stars ?? 0} نجوم</small></div><div className="review-actions"><button className="approve-button" title="اعتماد" onClick={onApprove}><Check size={16} /></button><button className="reject-button" title="إعادة للمحاولة" onClick={onReject}><X size={16} /></button></div></div>;
}

function ActivityRow({ item, task, childName }: { item: Completion; task?: Task; childName: string }) {
  return <div className="activity-row"><span className={`activity-icon ${item.status}`}><Sparkles size={17} /></span><div><b>{childName} {item.status === "approved" ? "أنجزت" : item.status === "pending" ? "أرسلت" : "تحتاج مراجعة"} {task?.title ?? "مهمة"}</b><small>{shortDate(item.task_date)} · {item.status === "approved" ? `+${item.stars_awarded} نجمة` : item.status === "pending" ? "بانتظار الموافقة" : "أعيدت للمحاولة"}</small></div><span className="activity-trail">✦</span></div>;
}

function RewardRequestRow({ request, childName, reward, onApprove, onReject }: { request: RewardRequest; childName: string; reward?: Reward; onApprove: () => void; onReject: () => void }) {
  return <div className="request-row"><span className="request-gift"><Gift size={18} /></span><div className="review-info"><b>{childName} تطلب {reward?.name ?? "مكافأة"}</b><small>{request.stars_cost} نجمة · {shortDate(request.requested_at.slice(0, 10))}</small></div><div className="review-actions"><button className="approve-button" title="اعتماد المكافأة" onClick={onApprove}><Check size={16} /></button><button className="reject-button" title="رفض الطلب" onClick={onReject}><X size={16} /></button></div></div>;
}

function StatCard({ icon, tone, label, value, hint }: { icon: React.ReactNode; tone: string; label: string; value: string | number; hint: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div className="stat-text"><small>{label}</small><b>{value}</b><span>{hint}</span></div></article>;
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><b>{title}</b><p>{text}</p></div>;
}

