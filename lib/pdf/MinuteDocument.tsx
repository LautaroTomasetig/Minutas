import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { statusLabels, type Minute } from "@/lib/schemas/minute";

const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 9,
    lineHeight: 1.6,
    paddingTop: 45,
    paddingBottom: 55,
    paddingHorizontal: 45,
    color: "#243447",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#243b50",
    paddingBottom: 12,
    marginBottom: 24,
  },
  brand: { fontSize: 21, fontWeight: 600 },
  accent: { color: "#d85736" },
  eyebrow: { fontSize: 7, color: "#6b798b", letterSpacing: 1.3 },
  title: { fontSize: 22, lineHeight: 1.3, fontWeight: 600, marginBottom: 22 },
  metadata: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#dfe5eb",
    marginBottom: 22,
  },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: 85, fontSize: 8, color: "#6b798b", fontWeight: 600 },
  value: { flex: 1 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 10,
    marginTop: 4,
  },
  introduction: { marginBottom: 23 },
  topic: {
    marginBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "#dfe5eb",
    paddingTop: 15,
  },
  topicHeading: { flexDirection: "row", gap: 10, marginBottom: 10 },
  number: { fontSize: 11, color: "#d85736", fontWeight: 600, width: 22 },
  topicTitle: { fontSize: 11, fontWeight: 600, flex: 1 },
  description: { marginBottom: 12 },
  detail: { marginBottom: 7 },
  detailLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: "#617386",
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 27,
    left: 45,
    right: 45,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#dfe5eb",
    paddingTop: 9,
    fontSize: 7,
    color: "#758393",
  },
});

// Fixed metadata removes the export clock from the resulting PDF bytes.
const documentDate = new Date("2000-01-01T00:00:00.000Z");
export function MinuteDocument({ minute }: { minute: Minute }) {
  return (
    <Document
      title={minute.title}
      author={minute.author}
      subject="Minuta de reunión"
      creator="Minutas"
      producer="Minutas"
      creationDate={documentDate}
      modificationDate={documentDate}
      language="es"
    >
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Text style={s.brand}>
            minutas<Text style={s.accent}>.</Text>
          </Text>
          <Text style={s.eyebrow}>REGISTRO DE REUNIÓN</Text>
        </View>
        <Text style={s.title}>{minute.title}</Text>
        <View style={s.metadata}>
          {[
            ["Autor", minute.author],
            ["Fecha", minute.date.split("-").reverse().join("/")],
            ["Hora", minute.time],
            ["Lugar", minute.location || "No especificado"],
          ].map(([label, value]) => (
            <View style={s.row} key={label}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.value}>{value}</Text>
            </View>
          ))}
          <View style={s.row}>
            <Text style={s.label}>Participantes</Text>
            <View style={s.value}>
              {minute.participants.length ? (
                minute.participants.map((group, index) => (
                  <Text key={index}>
                    {group.area ? `${group.area}: ` : ""}
                    {group.people.join(", ")}
                  </Text>
                ))
              ) : (
                <Text>No especificado</Text>
              )}
            </View>
          </View>
        </View>
        <Text style={s.sectionTitle} minPresenceAhead={35}>
          Introducción
        </Text>
        <Text style={s.introduction}>{minute.introduction}</Text>
        <Text style={s.sectionTitle} minPresenceAhead={50}>
          Puntos tratados
        </Text>
        {!minute.topics.length && (
          <Text>No se especificaron puntos tratados.</Text>
        )}
        {minute.topics.map((topic) => (
          <View key={topic.number} style={s.topic}>
            <View style={s.topicHeading} minPresenceAhead={40}>
              <Text style={s.number}>
                {String(topic.number).padStart(2, "0")}
              </Text>
              <Text style={s.topicTitle}>{topic.title}</Text>
            </View>
            <Text style={s.description} orphans={2} widows={2}>
              {topic.description}
            </Text>
            {[
              ["Decisión tomada", topic.decision],
              ["Acción requerida", topic.action],
              ["Responsable", topic.responsible],
              ["Fecha límite", topic.deadline],
              ["Estado", topic.status ? statusLabels[topic.status] : null],
              ["Punto pendiente", topic.pendingIssue],
            ].map(([label, value]) => (
              <View key={label} style={s.detail}>
                <Text style={s.detailLabel} minPresenceAhead={18}>
                  {label}
                </Text>
                <Text orphans={2} widows={2}>
                  {value || "No especificado"}
                </Text>
              </View>
            ))}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>MINUTAS · DOCUMENTACIÓN DE REUNIONES</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
