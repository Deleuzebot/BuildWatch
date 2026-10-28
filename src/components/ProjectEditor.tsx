import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Project, statuses, Meeting } from "../data/projects";
import { validateProject } from "../lib/validate";
import { saveProject } from "../lib/api";
import ProjectMap from "./ProjectMap";
let count = 0;
function id() {
  return `project-${Date.now().toString(36)}-${(++count).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export default function ProjectEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Project | null;
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [draft, setDraft] = useState<Project>(() =>
    initial
      ? { ...initial, meetings: initial.meetings.map((m) => ({ ...m })) }
      : {
          id: id(),
          name: "",
          address: "",
          neighborhood: "",
          status: "Proposed",
          category: "",
          latitude: 35.994,
          longitude: -78.899,
          description: "",
          developer: "",
          homes: 0,
          completion: "",
          meetings: [],
        },
  );
  const [lat, setLat] = useState(String(draft.latitude));
  const [lng, setLng] = useState(String(draft.longitude));
  const [homes, setHomes] = useState(String(draft.homes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reset, setReset] = useState(1);
  function update(key: keyof Project, value: unknown) {
    setDraft((p) => ({ ...p, [key]: value }));
  }
  function place(latitude: number, longitude: number) {
    setLat(latitude.toFixed(6));
    setLng(longitude.toFixed(6));
    setDraft((p) => ({ ...p, latitude, longitude }));
  }
  function meeting(index: number, key: keyof Meeting, value: string) {
    setDraft((p) => ({
      ...p,
      meetings: p.meetings.map((m, i) =>
        i === index ? { ...m, [key]: value } : m,
      ),
    }));
  }
  async function publish() {
    const next = {
      ...draft,
      latitude: lat.trim() ? Number(lat) : NaN,
      longitude: lng.trim() ? Number(lng) : NaN,
      homes: homes.trim() ? Number(homes) : NaN,
    };
    const issue = validateProject(next);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await saveProject(next);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={s.page}>
        <View style={s.top}>
          <Text style={s.heading}>
            {initial ? "Edit project" : "Add project"}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onClose}
            style={s.secondary}
          >
            <Text>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.note}>
            Place a pin, enter the project details, then publish to the shared
            map. Changes are saved on the server.
          </Text>
          <View style={s.map}>
            <ProjectMap
              projects={[draft]}
              onSelect={() => {}}
              resetKey={reset}
              onPlace={place}
            />
          </View>
          <Text style={s.note}>
            Click or tap the map to move the pin. Or enter coordinates below.
          </Text>
          <View style={s.row}>
            <View style={s.grow}>
              <Field label="Latitude" value={lat} onChangeText={setLat} />
            </View>
            <View style={s.grow}>
              <Field label="Longitude" value={lng} onChangeText={setLng} />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            style={s.secondary}
            onPress={() => {
              const a = Number(lat),
                b = Number(lng);
              if (
                !lat.trim() ||
                !lng.trim() ||
                !Number.isFinite(a) ||
                !Number.isFinite(b) ||
                Math.abs(a) > 90 ||
                Math.abs(b) > 180
              ) {
                setError("Enter valid coordinates first.");
                return;
              }
              place(a, b);
              setReset((v) => v + 1);
            }}
          >
            <Text>Show coordinates on map</Text>
          </Pressable>
          {(
            [
              "name",
              "address",
              "city",
              "county",
              "state",
              "neighborhood",
              "category",
              "description",
              "developer",
              "completion",
            ] as const
          ).map((key) => (
            <Field
              key={key}
              label={
                {
                  name: "Project name",
                  city: "City",
                  county: "County",
                  state: "State",
                  address: "Street address",
                  neighborhood: "Neighborhood / city",
                  category: "Project category",
                  description: "Description",
                  developer: "Developer / organization",
                  completion: "Target completion",
                }[key]
              }
              value={draft[key] || ""}
              multiline={key === "description"}
              onChangeText={(v) => update(key, v)}
            />
          ))}
          <Field
            label="Number of homes (0 for none)"
            value={homes}
            onChangeText={setHomes}
          />
          <Text style={s.label}>Development status</Text>
          <View style={s.statuses}>
            {statuses.map((status) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: draft.status === status }}
                key={status}
                style={[s.secondary, draft.status === status && s.active]}
                onPress={() => update("status", status)}
              >
                <Text style={draft.status === status ? { color: "white" } : {}}>
                  {status}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.heading}>Source links and documents</Text>
          <Text style={s.note}>
            Link to publicly accessible HTTPS documents or source pages.
          </Text>
          {(draft.sources || []).map((source, i) => (
            <View key={i} style={s.meeting}>
              <Field
                label={`Source ${i + 1} title`}
                value={source.title}
                onChangeText={(value) =>
                  update(
                    "sources",
                    draft.sources!.map((s, j) =>
                      j === i ? { ...s, title: value } : s,
                    ),
                  )
                }
              />
              <Field
                label={`Source ${i + 1} URL`}
                value={source.url}
                onChangeText={(value) =>
                  update(
                    "sources",
                    draft.sources!.map((s, j) =>
                      j === i ? { ...s, url: value } : s,
                    ),
                  )
                }
              />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  update(
                    "sources",
                    draft.sources!.filter((_, j) => j !== i),
                  )
                }
                style={s.secondary}
              >
                <Text>Remove source</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            style={s.secondary}
            onPress={() =>
              update("sources", [
                ...(draft.sources || []),
                { title: "", url: "" },
              ])
            }
          >
            <Text>Add source link</Text>
          </Pressable>
          <Text style={s.heading}>Public meetings</Text>
          <Text style={s.note}>
            Optional. Enter dates with their UTC offset, for example
            2026-11-10T18:30:00-05:00. This keeps the same meeting time on every
            device.
          </Text>
          {draft.meetings.map((m, i) => (
            <View key={m.id} style={s.meeting}>
              <Field
                label={`Meeting ${i + 1} title`}
                value={m.title}
                onChangeText={(v) => meeting(i, "title", v)}
              />
              <Field
                label={`Meeting ${i + 1} date and timezone`}
                value={m.startsAt}
                onChangeText={(v) => meeting(i, "startsAt", v)}
              />
              <Field
                label={`Meeting ${i + 1} venue`}
                value={m.venue}
                onChangeText={(v) => meeting(i, "venue", v)}
              />
              <Field
                label={`Meeting ${i + 1} agenda`}
                value={m.agenda}
                multiline
                onChangeText={(v) => meeting(i, "agenda", v)}
              />
              <Pressable
                accessibilityRole="button"
                style={s.secondary}
                onPress={() =>
                  update(
                    "meetings",
                    draft.meetings.filter((_, index) => index !== i),
                  )
                }
              >
                <Text>Remove meeting {i + 1}</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            style={s.secondary}
            onPress={() =>
              update("meetings", [
                ...draft.meetings,
                { id: id(), title: "", startsAt: "", venue: "", agenda: "" },
              ])
            }
          >
            <Text>Add a meeting</Text>
          </Pressable>
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={[s.publish, busy && { opacity: 0.5 }]}
            onPress={() => void publish()}
          >
            <Text style={s.publishText}>
              {busy ? "Publishing…" : "Publish to shared map"}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
function Field({
  label,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        style={[s.input, props.multiline && { minHeight: 95 }]}
        {...props}
      />
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F6F7F2" },
  top: {
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heading: { fontSize: 22, fontWeight: "700", color: "#163A30" },
  content: {
    padding: 22,
    gap: 15,
    width: "100%",
    maxWidth: 850,
    alignSelf: "center",
  },
  note: { fontSize: 13, lineHeight: 21, color: "#567066" },
  map: {
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E1D8",
  },
  label: { fontSize: 13, fontWeight: "600", color: "#244D3D", marginBottom: 7 },
  input: {
    padding: 13,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#CEDBCF",
    backgroundColor: "white",
    borderRadius: 10,
    color: "#173C30",
  },
  row: { flexDirection: "row", gap: 12 },
  grow: { flex: 1 },
  secondary: {
    padding: 12,
    backgroundColor: "#E2EBDD",
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  statuses: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  active: { backgroundColor: "#164A37" },
  meeting: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#E8EEE3",
    gap: 12,
  },
  error: { color: "#A52C21", fontSize: 14 },
  publish: {
    padding: 17,
    backgroundColor: "#164A37",
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 30,
  },
  publishText: { color: "white", fontSize: 16, fontWeight: "700" },
});
