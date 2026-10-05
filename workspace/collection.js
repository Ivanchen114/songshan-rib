// Teacher-set collection scope. No deadline is inferred from the calendar/week.
export const COLLECTION={term:'11501',id:'w45-11501',weeks:[4,5],title:'W4／W5',enabled:true,endsAt:null};
export function collectionFor(term,now=new Date()){
 if(term!==COLLECTION.term||!COLLECTION.enabled||(COLLECTION.endsAt&&now.getTime()>=new Date(COLLECTION.endsAt).getTime()))return null;
 return {...COLLECTION,weeks:[...COLLECTION.weeks]};
}
