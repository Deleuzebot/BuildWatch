import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import coverage from '../data/northCarolinaCoverage.json';
export default function CoveragePanel({ visible, onClose, onSearch }: { visible: boolean; onClose: () => void; onSearch: (term: string) => void }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={s.page}>
      <View style={s.header}><Text style={s.title}>Coverage & sources</Text><Pressable accessibilityRole="button" accessibilityLabel="Close coverage" onPress={onClose} style={s.button}><Text style={s.buttonText}>Done</Text></Pressable></View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Across North Carolina</Text>
        <Text style={s.body}>{coverage.municipalities.length} municipalities and {coverage.counties.length} counties meet the 50,000-resident threshold in the state’s July 2025 standard population estimates.</Text>
        <View style={s.card}>
          <Text style={s.heading}>{coverage.total.toLocaleString()} imported source records</Text>
          <Text style={s.body}>{(coverage.curated + coverage.municipal).toLocaleString()} curated or municipal tracker records · {coverage.permitRecords.toLocaleString()} permit-only records. Source-inventory snapshot reviewed {coverage.reviewedAt}, including archived records. These are not current public-map counts.</Text>
        </View>
        <View style={s.notice}>
          <Text style={s.heading}>Stormwater permits are supporting records</Text>
          <Text style={s.body}>Permit-only records use NC DEQ’s August 10, 2026 construction-stormwater register. “Approved” means that environmental coverage was listed as active on that date. It does not establish full local approval, current construction, or that work remains unfinished. Unverified permit-only entries are archived and excluded from public markers. Administrators can preserve verified links to community-facing developments or document scope before restoration.</Text>
        </View>
        <Text style={s.heading}>Sources reviewed</Text>
        {coverage.limitations.map(text => <Text key={text} style={s.body}>• {text}</Text>)}
        <Text style={s.body}>Local project inventories have been reviewed for the original four cities and {coverage.localInventories.map(x => x.jurisdiction).join(', ')}. Areas supported only by stormwater records need further local project research before public-facing developments can be displayed. No county or city is claimed to have every development verified.</Text>
        <Text style={s.heading}>Browse by county</Text>
        <Text style={s.body}>Includes smaller municipalities and unincorporated sites. Source-inventory counts include archived records and use approximate locations. Tap a county to search the currently public map.</Text>
        {coverage.counties.map(c => <Pressable key={c.county} accessibilityRole="button" accessibilityLabel={`Search ${c.county} County`} onPress={() => onSearch(`${c.county} County`)} style={s.row}><Text style={s.rowTitle}>{c.county} County</Text><Text style={s.body}>{c.records.toLocaleString()} source records · {c.projectRecords} project-tracker records · population {c.population.toLocaleString()}</Text></Pressable>)}
        <Text style={s.heading}>Municipalities at 50,000+</Text>
        {coverage.municipalities.map(c => <Text key={c.city} style={s.body}>{c.city} · population {c.population.toLocaleString()} · {c.records.toLocaleString()} source-inventory records</Text>)}
        <Text style={s.heading}>Population sources</Text>
        {Object.entries(coverage.populationSources).map(([name,url]) => <Pressable key={name} accessibilityRole="link" onPress={() => void Linking.openURL(url)}><Text style={s.link}>NC OSBM {name} ↗</Text></Pressable>)}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F6F7F2'},header:{padding:20,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},title:{fontSize:22,fontWeight:'800',color:'#203F36'},heading:{fontSize:18,fontWeight:'700',color:'#203F36',marginBottom:8,marginTop:12},content:{padding:20,paddingBottom:50,gap:10},body:{fontSize:14,lineHeight:22,color:'#52665F'},button:{padding:12,backgroundColor:'#E2EAE2',borderRadius:20},buttonText:{fontWeight:'700',color:'#203F36'},card:{padding:16,backgroundColor:'white',borderRadius:14},notice:{padding:16,backgroundColor:'#FFF0D8',borderRadius:14},row:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#DCE4DA'},rowTitle:{fontSize:16,fontWeight:'700',color:'#203F36'},link:{color:'#2466A5',paddingVertical:10}});
