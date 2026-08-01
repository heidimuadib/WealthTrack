import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

// The wordmark's W drawn as a sparkline: down, up, down, then a taller finish
// with a marker dot on the last point. Letter and chart in one shape, which is
// the whole brand in one shape. Replaces the stock wallet icon.
const BrandMark = ({ size = 30, color = '#FFFFFF' }) => (
    <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path
            d="M6 15 L15 35 L24 21 L32 33 L41 11"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
        <Circle cx={41} cy={11} r={3.6} fill={color} />
    </Svg>
);

export default BrandMark;
