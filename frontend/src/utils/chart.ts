export interface ChartPoint { label: string; value: number | null }
export function chartGeometry(points: ChartPoint[]) {
  const values=points.flatMap(p=>p.value==null?[]:[p.value])
  const min=Math.min(0,...values), max=Math.max(0,...values)
  const top=max===min?min+1:max
  const width=Math.max(620,points.length*80), height=300
  const y=(n:number)=>34+(top-n)/(top-min)*190
  const x=(i:number)=>70+(i+0.5)*(width-110)/Math.max(points.length,1)
  const segments: {x:number;y:number}[][]=[]
  let segment:{x:number;y:number}[]=[]
  points.forEach((p,i)=>{if(p.value==null){if(segment.length)segments.push(segment);segment=[]}else segment.push({x:x(i),y:y(p.value)})})
  if(segment.length)segments.push(segment)
  return {width,height,min,max:top,y,x,zero:y(0),segments}
}
