// 可信本地图标在构建时作为文本内联；不依赖沙盒跨源 CSS mask。
import openai from './icons/brand-openai.svg' with { type: 'text' };
import xai from './icons/brand-xai.svg' with { type: 'text' };
import ai21 from './icons/brand-ai21.svg' with { type: 'text' };
import moonshotai from './icons/brand-kimi.svg' with { type: 'text' };
import inception from './icons/inception.svg' with { type: 'text' };
import liquid from './icons/liquid.svg' with { type: 'text' };
import poolside from './icons/poolside.svg' with { type: 'text' };
import reflection from './icons/reflection.svg' with { type: 'text' };
import thinkingmachines from './icons/thinkingmachines.svg' with { type: 'text' };
import vispark from './icons/vispark.svg' with { type: 'text' };
import vivgrid from './icons/vivgrid.svg' with { type: 'text' };
import xiaomi from './icons/xiaomi.svg' with { type: 'text' };

export const MONO_ICONS = Object.freeze({
  openai, xai, ai21, moonshotai, inception, liquid, poolside,
  reflection, thinkingmachines, vispark, vivgrid, xiaomi,
});
