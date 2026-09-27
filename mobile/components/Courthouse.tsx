import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useReducedMotion } from '@/lib/motion';

/** An original architectural miniature. Gentle drift gives the court a living presence. */
export function Courthouse({ compact = false }: { compact?: boolean }) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) { cancelAnimation(drift); drift.value = 0; return; }
    drift.value = withRepeat(withTiming(1, { duration: 4400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [drift, reduced]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * drift.value }] }));
  return <Animated.View accessible={false} pointerEvents="none" style={[styles.art, compact && styles.compact, motion]}>
    <Svg width="100%" height="100%" viewBox="0 0 400 260">
      <Defs>
        <LinearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#D7EFE3"/><Stop offset="1" stopColor="#739C9B"/></LinearGradient>
        <LinearGradient id="roof" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#ECF5E7"/><Stop offset="1" stopColor="#99BFB3"/></LinearGradient>
        <LinearGradient id="door" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#E8CBA0"/><Stop offset="1" stopColor="#AB8664"/></LinearGradient>
      </Defs>
      <Circle cx="204" cy="115" r="101" fill="#BCE8D5" opacity=".035"/>
      <Circle cx="204" cy="115" r="79" fill="none" stroke="#85BAAD" strokeOpacity=".18"/>
      <Circle cx="320" cy="51" r="19" fill="#EAD9BB"/>
      <Path d="M24 209H376M45 224H353" stroke="#557C80" strokeOpacity=".3"/>
      <Ellipse cx="202" cy="224" rx="132" ry="15" fill="#081621" opacity=".5"/>
      <Path d="M87 211L205 235L330 210L209 187Z" fill="#355C65"/>
      <Path d="M87 205L205 227L330 203L209 180Z" fill="#698D8C"/>
      <Path d="M104 195L204 215L314 194L207 173Z" fill="#A3BEB0"/>
      <Path d="M115 101L215 80L306 107V183L210 207L115 187Z" fill="#3D656A"/>
      <Path d="M115 101L215 80V185L115 187Z" fill="url(#stone)"/>
      <Path d="M115 105L214 125V200L115 181Z" fill="#5C8381"/>
      <Path d="M214 125L306 106V182L214 201Z" fill="#244C57"/>
      {[0,1,2,3].map(i=><G key={i} transform={`translate(${125+i*24} ${115+i*4.8})`}><Path d="M0 0L12 2V61L0 59Z" fill="url(#stone)"/><Path d="M-3 -4L15 -1V5L-3 2ZM-3 57L15 60V66L-3 63Z" fill="#D2DFCB"/></G>)}
      {[0,1,2].map(i=><Path key={i} d={`M${233+i*23} ${132-i*4.8}l12 -3v39l-12 3z`} fill="#D8BD8F" opacity={.8-i*.15}/>)}
      <Path d="M157 179V150Q170 131 181 155V184Z" fill="url(#door)"/>
      <Path d="M104 106L165 54L224 127Z" fill="url(#roof)"/>
      <Path d="M165 54L259 35L316 107L224 127Z" fill="#82AAA1"/>
      <Path d="M104 106L224 130L316 110V102L224 122L104 99Z" fill="#D7E7D2"/>
      <Path d="M126 99L166 66L203 114Z" fill="#345D64"/>
      <Circle cx="167" cy="91" r="9" fill="#C3DCC9"/>
      <Path d="M167 84V98M159 89H175M160 89L157 94H163ZM174 89L171 94H177Z" stroke="#426B6C" strokeWidth="1.3" fill="none"/>
      <Path d="M61 181V145M52 156L61 138L70 157M51 171L61 151L72 171" stroke="#7DAF9E" strokeWidth="5" strokeLinecap="round"/>
      <Path d="M340 190V155M330 165L340 147L350 165M329 179L340 159L352 179" stroke="#7DAF9E" strokeWidth="5" strokeLinecap="round"/>
      <Circle cx="76" cy="80" r="2" fill="#E5CFAC"/><Circle cx="286" cy="19" r="1.5" fill="#E5CFAC"/><Circle cx="343" cy="112" r="2" fill="#BCE8D5"/>
    </Svg>
  </Animated.View>;
}
const styles = StyleSheet.create({ art: { height: 235, width: '100%' }, compact: { height: 180 } });
