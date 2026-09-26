import {W5_TOPICS,w5Topic} from './w5-topics.js';
import {W7_TOPICS,w7Topic} from './w7-topics.js';
import {W8_TOPICS,w8Topic} from './w8-topics.js';
export const ALL_TOPICS=[...W5_TOPICS,...W7_TOPICS,...W8_TOPICS];
// The anonymous gallery filters W5/W7 only; W8 proposals are never public (they carry names).
export const PUBLIC_TOPICS=[...W5_TOPICS,...W7_TOPICS];
export const topicById=id=>w5Topic(id)||w7Topic(id)||w8Topic(id);
