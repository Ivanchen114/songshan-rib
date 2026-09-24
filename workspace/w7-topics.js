// Curated source pairs; prompts deliberately leave the conclusion to students.
export const W7_TOPICS=Object.freeze([
 {id:'N01',title:'手寫與打字',newsLabel:'Science News｜2024',news:'https://www.sciencenews.org/article/handwriting-brain-connections-learning',researchLabel:'Frontiers in Psychology｜2024 原始研究',research:'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1219945/full'},
 {id:'N02',title:'延後上學時間',newsLabel:'CBS News｜2018',news:'https://www.cbsnews.com/news/seattle-high-schools-later-start-time-improved-academic-performance/',researchLabel:'Science Advances｜2018 原始研究',research:'https://pmc.ncbi.nlm.nih.gov/articles/PMC6291308/'},
 {id:'N03',title:'走路與創意',newsLabel:'Stanford Report｜2014 校方研究新聞',news:'https://news.stanford.edu/stories/2014/04/walking-vs-sitting-042414',researchLabel:'Journal of Experimental Psychology｜2014 原始研究 PDF',research:'https://aaalab.stanford.edu/assets/papers/2014/Give_your_ideas_some_legs.pdf'},
 {id:'N04',title:'AI 數學家教',newsLabel:'Axios｜2024',news:'https://www.axios.com/2024/08/15/ai-tutors-learning-education-khan-academy-wharton',researchLabel:'PNAS｜2025 正式論文',research:'https://doi.org/10.1073/pnas.2422633122',note:'新聞報導較早的研究版本，正式論文於 2025 年發表；比對時要記錄版本日期。'}
]);
export const w7Topic=id=>W7_TOPICS.find(t=>t.id===id)||null;
