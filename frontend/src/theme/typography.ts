// Type scale. Playfair Display is reserved for display moments only —
// hero, screen titles, prices. Everything else uses DM Sans.
import { type TextStyle } from 'react-native';

type TypeScale = Record<
  'hero' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'price',
  TextStyle
>;

export const type: TypeScale = {
  hero: { fontFamily: 'PlayfairDisplay-Bold', fontSize: 32, lineHeight: 40 },
  title: { fontFamily: 'PlayfairDisplay-SemiBold', fontSize: 24, lineHeight: 32 },
  heading: { fontFamily: 'DMSans-SemiBold', fontSize: 18, lineHeight: 26 },
  body: { fontFamily: 'DMSans-Regular', fontSize: 16, lineHeight: 24 },
  label: { fontFamily: 'DMSans-Medium', fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: 'DMSans-Regular', fontSize: 12, lineHeight: 18 },
  price: { fontFamily: 'PlayfairDisplay-Bold', fontSize: 20, lineHeight: 28 },
};
