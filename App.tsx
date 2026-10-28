import ActivityFilter from './src/components/ActivityFilter';
import ProjectActivity from './src/components/ProjectActivity';
import type {ActivityPeriod} from './src/lib/activity';
import TypeIcon from './src/components/TypeIcon';
import TypeFilter from './src/components/TypeFilter';
import {MapPopoverProvider} from './src/components/MapPopover';
import type {PrimaryCategory} from './src/lib/categories';
import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import ProjectMap from "./src/components/ProjectMap";
import MobileExplorer from "./src/components/MobileExplorer";
import {LayoutProvider,useLayoutPreference} from './src/lib/LayoutPreference';
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Project,
  Status,
  statuses,
  statusColors,
} from "./src/data/projects";
import { useMapBrowser } from "./src/lib/useMapBrowser";
import CoveragePanel from "./src/components/CoveragePanel";
import ClusterPicker from './src/components/ClusterPicker';
import type { MapNode } from './src/lib/mapTypes';
import {
  meetingTime,
  upcomingMeetings,
} from "./src/lib/projects";
import ProjectEditor from "./src/components/ProjectEditor";
import { SessionProvider, useSession } from "./src/account/Session";
import AccountPanel, { Panel, Action } from "./src/account/AccountPanel";
import { api, APIError } from "./src/account/http";
import {
  rememberProject,
  consumeProject,
  invitationToken,
} from "./src/account/resume";
import WelcomeGate from "./src/account/Welcome";
import{consumeAdministratorResume}from'./src/account/adminResume';
export default function App() {
  return (
    <LayoutProvider><SessionProvider>
      <WelcomeGate>
        <MapPopoverProvider><BuildWatchApp /></MapPopoverProvider>
      </WelcomeGate>
    </SessionProvider></LayoutProvider>
  );
}
function BuildWatchApp() {
  const { account } = useSession();
  const {mobile} = useLayoutPreference();
  const canEdit =
    account?.role === "collaborator" ||
    (account?.role === "admin" && account.mfa);
  const [menu, setMenu] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [cluster, setCluster] = useState<MapNode | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelProject, setPanelProject] = useState<Project | undefined>();
  const [returnProject, setReturnProject] = useState<string | null>(null);
  const [following, setFollowing] = useState<string[]>([]);
  useEffect(() => {
    if (!account) {
      setFollowing([]);
      setEditing(null);
      return;
    }
    void api("/api/follows")
      .then((list: any[]) => setFollowing(list.map((p) => p.projectId)))
      .catch(() => {});
    if(consumeAdministratorResume()){setPanel('Administrator Security');return;}
    void consumeProject().then((id) => {
      if (id) setReturnProject(id);
      else if (invitationToken()) setPanel("Settings");
    });
  }, [account?.id]);
  function showPanel(value: Panel) {
    setMenu(false);
    setPanel(value);
  }
  async function follow(project: Project) {
    if (!account) {
      await rememberProject(project.id);
      setSelected(null);
      showPanel("Login");
      return;
    }
    try {
      const list = await api(
        `/api/follows/${project.id}`,
        following.includes(project.id) ? "DELETE" : "PUT",
      );
      setFollowing(list.map((p: any) => p.projectId));
    } catch (error) {
      if (error instanceof APIError && error.status === 402) {
        setSelected(null);
        showPanel("BuildWatch Plus");
      } else
        setConnection(
          error instanceof Error ? error.message : "Could not follow project.",
        );
    }
  }

  const [connection, setConnection] = useState("");
  const [editing, setEditing] = useState<{ project: Project | null } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "All">("All");
  const [selected, setSelected] = useState<Project | null>(null);
  const [preview, setPreview] = useState<Project | null>(null);
  const [types,setTypes]=useState<PrimaryCategory[]>([]);
  const [activity,setActivity]=useState<ActivityPeriod|null>(null);
  const browser = useMapBrowser(query, status, types, activity);
  const fittedFilter = useRef('');
  useEffect(()=>{
    const key=query.trim()+'|'+status;
    if(browser.resultsCurrent&&browser.total>0&&fittedFilter.current!==key){fittedFilter.current=key;setResetKey(v=>v+1);}
  },[mobile,query,status,types,browser.resultsCurrent,browser.total]);
  const selecting = useRef(0);
  function refresh() { setConnection(""); browser.refresh(); }
  async function open(project: { id: string }, details = false) {
    const request = ++selecting.current;
    setPreview(null);
    setConnection("Loading project…");
    try {
      const full = await browser.select(project.id);
      if (selecting.current === request) { if(!details)setPreview(full);else setSelected(full); setConnection(""); }
    } catch(error) { if(selecting.current === request) setConnection(error instanceof Error ? error.message : "Could not load project."); }
  }
  useEffect(() => {
    if(returnProject) { void open({ id: returnProject }, true); setReturnProject(null); }
  }, [returnProject]);
  useEffect(()=>{selecting.current++;setPreview(null);setConnection('');},[query,status,types,activity]);
  const connectionText = connection || browser.error || (browser.loading ? "Loading shared map…" : "");
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.page}>
        <StatusBar style="dark" />
        {mobile ? <MobileExplorer browser={browser} query={query} status={status} types={types} onTypes={setTypes} activity={activity} onActivity={setActivity}
          onQuery={setQuery} onStatus={setStatus} preview={preview}
          onSelect={p=>void open(p)} onOpen={()=>{if(preview){setSelected(preview);setPreview(null);}}}
          onDismiss={()=>{selecting.current++;setPreview(null);setConnection('');}}
          onCluster={setCluster} onMenu={()=>setMenu(true)} onCoverage={()=>setCoverageOpen(true)}
          onRefresh={refresh} resetKey={resetKey}
          message={connection||browser.error} canEdit={canEdit} onAdd={()=>setEditing({project:null})}/>
        : <>
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>YOUR NEIGHBORHOOD, IN PROGRESS</Text>
            <Text style={s.brand}>
              BuildWatch<Text style={s.dot}>.</Text>
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            onPress={() => setMenu(true)}
            style={[s.avatar, { width: 64 }]}
          >
            <Text style={s.avatarText}>Menu</Text>
          </Pressable>
        </View>
        {canEdit && <View
          style={{
            flexDirection: "row",
            gap: 12,
            paddingHorizontal: 22,
            paddingBottom: 12,
          }}
        >
          {canEdit && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing({ project: null })}
              style={{
                backgroundColor: "#164A37",
                padding: 12,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>
                + Add project
              </Text>
            </Pressable>
          )}
        </View>}
        <>
            <View style={s.searchWrap}>
              <TextInput
                accessibilityLabel="Search projects"
                placeholder="Search project, city, county, street, or category"
                placeholderTextColor="#647874"
                value={query}
                onChangeText={setQuery}
                style={s.search}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <Pressable
                  accessibilityLabel="Clear search"
                  onPress={() => setQuery("")}
                  style={s.clear}
                >
                  <Text>✕</Text>
                </Pressable>
              )}
            </View>
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.filters}
              >
                {statuses.filter((status) => !["Completed","Cancelled","On hold"].includes(status)).map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: status === item }}
                    key={item}
                    onPress={() => setStatus(current => current === item ? "All" : item)}
                    style={[s.chip, status === item && s.chipActive]}
                  >
                    <View accessible={false} style={{width:8,height:8,borderRadius:4,backgroundColor:statusColors[item]}} />
                    <Text
                      style={[s.chipText, status === item && s.chipTextActive]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
                <TypeFilter selected={types} onChange={setTypes}/><ActivityFilter value={activity} onChange={setActivity}/>
              </ScrollView>
            </View>
            <View style={s.mapWrap}>
              <ProjectMap
                projects={[]}
                nodes={browser.feed?.nodes || []}
                onViewport={browser.onViewport}
                onSelectId={id => void open({ id })}
                onCluster={setCluster}
                focusBounds={browser.focusBounds}
                onSelect={open}
                resetKey={resetKey}
                showControls={false}
                selectedProjectId={preview?.id}
                onBackgroundPress={()=>{selecting.current++;setPreview(null);setConnection('');}}
              />
              {!!connectionText&&<View pointerEvents="none" style={{position:'absolute',top:12,left:12,right:12,alignItems:'flex-start'}}><Text accessibilityRole="status" style={{backgroundColor:'#F6F7F2',padding:10,borderRadius:10,color:'#63736E',fontSize:12}}>{connectionText}</Text></View>}
              <View style={s.mapLabel}>
                <Text style={s.mapLabelText}>
                  {browser.total.toLocaleString()} matching map records
                </Text>
              </View>
              {preview&&<View style={s.webPreview}>
                <View style={{flexDirection:'row',alignItems:'flex-start',gap:12}}>
                  <View style={{flex:1,gap:8}}>
                    <Text accessibilityRole="header" style={s.cardTitle}>{preview.name}</Text>
                    <Badge status={preview.status}/>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close project preview" onPress={()=>{selecting.current++;setPreview(null);setConnection('');}} style={{width:44,height:44,borderRadius:22,backgroundColor:'#E5EBE3',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:24,color:'#42604D'}}>×</Text></Pressable>
                </View>
                <Text style={s.address}>{preview.address}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={'Open '+preview.name} onPress={()=>{setSelected(preview);setPreview(null);}} style={{backgroundColor:'#214D3B',borderRadius:14,padding:14,flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:'white',fontWeight:'700',fontSize:16}}>Open</Text><Text style={{color:'white',fontSize:16}}>↗</Text></Pressable>
              </View>}
            </View>
            {!browser.loading&&!browser.error&&browser.total===0&&<Text style={[s.body,{padding:16}]}>No matching projects. Try another search or clear the selected status.</Text>}

        </>
        </>}
        <Modal
          visible={selected !== null}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelected(null)}
        >
          {selected && (
            <SafeAreaView style={s.page}>
              <View style={s.detailHeader}>
                <Text style={s.eyebrow}>{selected.evidenceType === "permit" ? "PERMIT RECORD" : "PROJECT DETAILS"}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close project details"
                  onPress={() => setSelected(null)}
                  style={s.close}
                >
                  <Text style={s.closeText}>Done</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={s.detail}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}><TypeIcon type={selected.primaryCategory||selected.category}/><Text style={[s.kicker,{flex:1}]}>
                  {selected.neighborhood.toUpperCase()} · {selected.category}
                </Text></View>
                <Text accessibilityRole="header" style={s.hero}>
                  {selected.name}
                </Text>
                <Text style={s.address}>{selected.address}</Text>
                {selected.county && <Text style={s.muted}>{selected.county} County{selected.jurisdiction ? ` · Source jurisdiction: ${selected.jurisdiction}` : ""}</Text>}
                {selected.reviewedAt && <Text style={s.muted}>Sources reviewed {selected.reviewedAt} · Pin shows an approximate project location</Text>}
                {selected.verificationNote && <View style={{ padding: 14, marginVertical: 12, borderRadius: 12, backgroundColor: selected.evidenceType === "permit" ? '#FFF0D8' : '#E5ECE4' }}><Text style={s.body}>{selected.verificationNote}</Text></View>}
                <Badge status={selected.status} />
                <Text style={s.description}>{selected.description}</Text><ProjectActivity projectId={selected.id}/>
                <View style={s.facts}>
                  <View style={s.fact}>
                    <Text style={s.muted}>Target completion</Text>
                    <Text style={s.factValue}>{selected.completion}</Text>
                  </View>
                  <View style={s.fact}>
                    <Text style={s.muted}>{selected.evidenceType === "municipal" ? "Planned homes / lots" : "New homes"}</Text>
                    <Text style={s.factValue}>{selected.homes || "—"}</Text>
                  </View>
                </View>
                <Text style={s.muted}>{selected.evidenceType === "permit" ? "Permit holder" : "Development partner"}</Text>
                <Text style={s.partner}>{selected.developer}</Text>
                {canEdit && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setEditing({ project: selected });
                      setSelected(null);
                    }}
                    style={{
                      padding: 14,
                      backgroundColor: "#E3EBDD",
                      borderRadius: 10,
                      marginBottom: 20,
                    }}
                  >
                    <Text style={{ color: "#164A37", fontWeight: "700" }}>
                      Edit this project
                    </Text>
                  </Pressable>
                )}
                <View style={{ gap: 10, marginBottom: 20 }}>
                  <Action
                    title={
                      following.includes(selected.id)
                        ? "Unfollow Development"
                        : "Follow Development"
                    }
                    onPress={() => void follow(selected)}
                  />
                  <Action
                    title="Suggest an Update"
                    onPress={() => {
                      setPanelProject(selected);
                      setSelected(null);
                      showPanel(account ? "Suggest an Update" : "Login");
                    }}
                  />
                </View>
                {!!selected.sources?.length && (
                  <Text style={s.sectionTitle}>Sources</Text>
                )}
                {selected.sources?.map((source) => (
                  <Pressable
                    accessibilityRole="link"
                    key={source.url}
                    onPress={() => void Linking.openURL(source.url)}
                    style={{ paddingVertical: 12 }}
                  >
                    <Text style={{ color: "#2466A5" }}>{source.title} ↗</Text>
                  </Pressable>
                ))}
                <Text style={s.sectionTitle}>Upcoming public meetings</Text>
                {upcomingMeetings([selected]).length === 0 ? (
                  <Text style={s.body}>{selected.meetings.length ? "No upcoming meetings in the recorded data. Past meetings remain saved; check the official sources for new notices." : "Meeting information has not been collected for this project. This does not mean no meeting is scheduled. Check the official sources for current notices."}</Text>
                ) : (
                  upcomingMeetings([selected]).map((meeting) => (
                    <View key={meeting.id} style={s.meeting}>
                      <Text style={s.meetingDate}>
                        {meetingTime(meeting.startsAt)}
                      </Text>
                      <Text style={s.cardTitle}>{meeting.title}</Text>
                      <Text style={s.body}>{meeting.venue}</Text>
                      <Text style={s.meetingAgenda}>{meeting.agenda}</Text>
                    </View>
                  ))
                )}
                <Text style={s.footnote}>
                  BuildWatch is independent of municipalities. Statuses reflect
                  cited records as of their review date. Confirm current project
                  and meeting information with the source organization.
                </Text>
              </ScrollView>
            </SafeAreaView>
          )}
        </Modal>
        <CoveragePanel visible={coverageOpen} onClose={() => setCoverageOpen(false)} onSearch={term => {
          setCoverageOpen(false); setQuery(term); setStatus("All"); setResetKey(v => v + 1);
        }} />
        <ClusterPicker node={cluster} query={query} status={status} types={types} activity={activity} onClose={() => setCluster(null)} onSelect={id => { setCluster(null); void open({ id }); }} />
        {canEdit && editing && (
          <ProjectEditor
            initial={editing.project}
            onClose={() => setEditing(null)}
            onSaved={(saved) => {
              browser.refresh();
              setEditing(null);
              setSelected(saved);
              setQuery("");
              setStatus("All");
              setResetKey((v) => v + 1);
              setConnection("Published to shared map");
            }}
          />
        )}
        <Modal
          visible={menu}
          transparent
          animationType="fade"
          onRequestClose={() => setMenu(false)}
        >
          <View
            style={{ flex: 1, flexDirection: "row", backgroundColor: "#0005" }}
          >
            <SafeAreaView
              style={{
                width: 290,
                maxWidth: "90%",
                backgroundColor: "#F6F7F2",
                padding: 20,
              }}
            >
              <ScrollView contentContainerStyle={{ gap: 12 }}>
                <Text style={s.brand}>BuildWatch.</Text>
                <Text style={s.muted}>
                  {account
                    ? `${account.name} · ${account.role}`
                    : "Explore freely as a guest"}
                </Text>
                <Action title="Close menu" onPress={() => setMenu(false)} />
                <Action
                  title="Explore Map"
                  onPress={() => {
                    setMenu(false);

                  }}
                />
                <Action title="Coverage & sources" onPress={()=>{setMenu(false);setCoverageOpen(true);}}/>
                <Action
                  title="Settings"
                  onPress={() => showPanel("Settings")}
                />
                {account ? (
                  <>
                    <Action
                      title="My Following"
                      onPress={() => showPanel("My Following")}
                    />
                    <Action
                      title="Notifications"
                      onPress={() => showPanel("Notifications")}
                    />
                    <Action
                      title="Account"
                      onPress={() => showPanel("Account")}
                    />
                    {!account.plus && (
                      <Action
                        title="Upgrade to BuildWatch Plus"
                        onPress={() => showPanel("BuildWatch Plus")}
                      />
                    )}
                  </>
                ) : (
                  <Action
                    title="Account"
                    onPress={() => showPanel("Login")}
                  />
                )}
                {canEdit && (
                  <>
                    <Action
                      title="Project Management"
                      onPress={() => showPanel("Project Management")}
                    />
                    <Action
                      title="Edit Map"
                      onPress={() => showPanel("Edit Map")}
                    />
                  </>
                )}
                {account?.role === "admin" && (
                  <>
                    <Action
                      title="Admin Dashboard"
                      onPress={() => showPanel("Admin Dashboard")}
                    />
                    <Action
                      title="Manage Users"
                      onPress={() => showPanel("Manage Users")}
                    />
                    <Action
                      title="Invite Collaborators"
                      onPress={() => showPanel("Invite Collaborators")}
                    />
                  </>
                )}
              </ScrollView>
            </SafeAreaView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss navigation menu"
              style={{ flex: 1 }}
              onPress={() => setMenu(false)}
            />
          </View>
        </Modal>
        {panel && (
          <AccountPanel
            initial={panel}
            project={panelProject}
            onClose={() => {
              setPanel(null);
              setPanelProject(undefined);
              void refresh();
              if (account)
                void api("/api/follows")
                  .then((list: any[]) =>
                    setFollowing(list.map((p) => p.projectId)),
                  )
                  .catch(() => {});
            }}
            onEdit={(project) => {
              if (!canEdit) return;
              setPanel(null);
              setSelected(null);
              setEditing({ project });
            }}
            onProject={(id) => {
              setPanel(null);
              void open({ id });
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function Badge({ status }: { status: Status }) {
  return (
    <View style={s.badge}>
      <View style={[s.statusDot, { backgroundColor: statusColors[status] }]} />
      <Text style={s.badgeText}>{status}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F6F7F2" },
  header: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#56706A",
  },
  brand: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: "#102D2B",
  },
  dot: { color: "#D36D43" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#DDE8DF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#254D43", fontWeight: "700" },
  demo: { paddingHorizontal: 22, paddingBottom: 14 },
  demoText: { color: "#63736E", fontSize: 12 },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    padding: 4,
    backgroundColor: "#E6EBE4",
    borderRadius: 13,
  },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#123F36" },
  tabText: { fontWeight: "600", fontSize: 13, color: "#49645C" },
  tabTextActive: { color: "#FFFFFF" },
  searchWrap: { marginHorizontal: 20, marginTop: 16, position: "relative" },
  search: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E1D8",
    borderRadius: 12,
    padding: 14,
    paddingRight: 44,
    fontSize: 14,
    color: "#183C33",
  },
  clear: { position: "absolute", right: 0, top: 0, padding: 16 },
  filters: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D5DFD6",
    backgroundColor: "#FFFFFF",
  },
  chipActive: { backgroundColor: "#DDEBDD", borderColor: "#5C826A" },
  chipText: { fontSize: 12, color: "#496257", fontWeight: "600" },
  chipTextActive: { color: "#173F2F" },
  mapWrap: {
    flex: 1,
    minHeight: 180,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E0D5",
  },
  map: { flex: 1 },
  webPreview: {position:'absolute',bottom:60,alignSelf:'center',width:360,maxWidth:'92%',padding:18,gap:10,borderRadius:22,backgroundColor:'#F6F7F2',borderWidth:1,borderColor:'#DAE3D9',shadowColor:'#173D32',shadowOpacity:.18,shadowRadius:16,elevation:10},
  reset: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
  },
  resetText: { fontWeight: "600", color: "#214737", fontSize: 12 },
  mapLabel: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "#123F36",
    padding: 10,
    borderRadius: 10,
  },
  mapLabelText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#183C33",
    marginBottom: 4,
  },
  muted: { fontSize: 12, color: "#62746B" },
  list: { flexGrow: 0, maxHeight: 225 },
  listContent: { paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 17,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0E6DC",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#637B69",
    flexShrink: 1,
  },
  arrow: { color: "#476E55", fontSize: 20 },
  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#163A30",
    marginVertical: 4,
  },
  address: { fontSize: 13, color: "#637369", marginBottom: 12 },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 7,
    backgroundColor: "#F0F3ED",
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#364B40" },
  empty: { padding: 20 },
  body: { fontSize: 14, lineHeight: 22, color: "#5C7064" },
  agenda: { padding: 22, gap: 16 },
  hero: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.9,
    color: "#13392E",
    marginVertical: 12,
  },
  meetingDate: {
    fontSize: 12,
    fontWeight: "700",
    color: "#93602B",
    marginBottom: 7,
  },
  meetingAgenda: {
    fontSize: 14,
    lineHeight: 22,
    color: "#425D4D",
    marginTop: 10,
  },
  detailHeader: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  close: { padding: 12, backgroundColor: "#E3EBDD", borderRadius: 10 },
  closeText: { color: "#214B35", fontWeight: "700" },
  detail: { padding: 24, paddingBottom: 40 },
  description: {
    fontSize: 17,
    lineHeight: 27,
    color: "#415A4B",
    marginVertical: 24,
  },
  facts: {
    flexDirection: "row",
    gap: 16,
    padding: 18,
    backgroundColor: "#E7EDDF",
    borderRadius: 14,
    marginBottom: 22,
  },
  fact: { flex: 1 },
  factValue: {
    fontSize: 23,
    fontWeight: "700",
    color: "#234D35",
    marginTop: 6,
  },
  partner: {
    fontSize: 16,
    color: "#234D35",
    fontWeight: "600",
    marginTop: 5,
    marginBottom: 28,
  },
  meeting: {
    padding: 17,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginTop: 14,
  },
  footnote: { fontSize: 12, lineHeight: 19, color: "#6B786D", marginTop: 28 },
});
