/* Test-side writer for the pattern wire format (the C twin of
 * packPatternForCore in src/loudlight.jsx). */
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include "../ll.h"
typedef struct { uint8_t* b; int n, cap; } wbuf;
static void wb_i32(wbuf*w,int32_t v){ if(w->n+4>w->cap){w->cap=w->cap*2+1024;w->b=realloc(w->b,w->cap);} memcpy(w->b+w->n,&v,4); w->n+=4; }
static void wb_f32(wbuf*w,float v){ int32_t i; memcpy(&i,&v,4); wb_i32(w,i); }
static void wb_bytes(wbuf*w,const void*p,int n){ while(w->n+n>w->cap){w->cap=w->cap*2+1024;w->b=realloc(w->b,w->cap);} memcpy(w->b+w->n,p,n); w->n+=n; }
/* A simple in-test pattern model. */
typedef struct {
  int bars; int lens[LL_MAX_BARS]; float mults[LL_MAX_BARS];
  uint8_t grid[16][LL_MAX_COLS], durs[16][LL_MAX_COLS], params[LL_MAX_COLS][8];
} tsyn;
typedef struct {
  int bars; int lens[LL_MAX_BARS]; float mults[LL_MAX_BARS];
  uint8_t grid[13][LL_MAX_COLS], vel[13][LL_MAX_COLS], rat[13][LL_MAX_COLS];
  int hasMotion; int16_t motion[7][13][LL_MAX_COLS];
} tdrm;
typedef struct { int id, master; tsyn s[2]; tdrm d; } tpat;
static void tpat_init(tpat*p,int id,int bars){
  memset(p,0,sizeof *p); p->id=id;
  for(int l=0;l<2;l++){ p->s[l].bars=bars; for(int i=0;i<bars;i++){p->s[l].lens[i]=16;p->s[l].mults[i]=1;} 
    for(int c=0;c<bars*16;c++){ uint8_t*q=p->s[l].params[c]; q[0]=100;q[1]=50;q[2]=0;q[3]=0;q[4]=1;q[5]=0;q[6]=2;q[7]=0; }
    for(int r=0;r<16;r++)for(int c=0;c<bars*16;c++)p->s[l].durs[r][c]=1; }
  p->d.bars=bars; for(int i=0;i<bars;i++){p->d.lens[i]=16;p->d.mults[i]=1;}
  for(int r=0;r<13;r++)for(int c=0;c<bars*16;c++){p->d.vel[r][c]=100;p->d.rat[r][c]=1;}
}
static int tpat_bars(const tpat*p){ int b=p->d.bars; if(p->s[0].bars>b)b=p->s[0].bars; if(p->s[1].bars>b)b=p->s[1].bars; return b; }
static void tpat_pack(const tpat*p,wbuf*w){
  w->n=0; wb_i32(w,0x31504C4C); wb_i32(w,p->id); wb_i32(w,tpat_bars(p)); wb_i32(w,p->master);
  for(int l=0;l<2;l++){ const tsyn*s=&p->s[l]; int W=s->bars*16;
    wb_i32(w,s->bars); for(int i=0;i<s->bars;i++)wb_i32(w,s->lens[i]); for(int i=0;i<s->bars;i++)wb_f32(w,s->mults[i]);
    for(int r=0;r<16;r++)wb_bytes(w,s->grid[r],W); for(int r=0;r<16;r++)wb_bytes(w,s->durs[r],W);
    for(int c=0;c<W;c++)wb_bytes(w,s->params[c],8); }
  { const tdrm*d=&p->d; int W=d->bars*16;
    wb_i32(w,d->bars); for(int i=0;i<d->bars;i++)wb_i32(w,d->lens[i]); for(int i=0;i<d->bars;i++)wb_f32(w,d->mults[i]);
    for(int r=0;r<13;r++)wb_bytes(w,d->grid[r],W); for(int r=0;r<13;r++)wb_bytes(w,d->vel[r],W); for(int r=0;r<13;r++)wb_bytes(w,d->rat[r],W);
    wb_i32(w,d->hasMotion); if(d->hasMotion)for(int k=0;k<7;k++)for(int r=0;r<13;r++)wb_bytes(w,d->motion[k][r],W*2); }
}
static int tpat_load(int slot,const tpat*p){ wbuf w={0,0,0}; tpat_pack(p,&w); uint8_t*s=ll_scratch(w.n); memcpy(s,w.b,w.n); int rc=ll_pattern_load(slot,w.n); free(w.b); return rc; }
static void write_wav(const char*path,const float*L,const float*R,int n,int sr){
  FILE*f=fopen(path,"wb"); if(!f)return;
  int dataBytes=n*2*2; int32_t v; int16_t s16;
  fwrite("RIFF",1,4,f); v=36+dataBytes; fwrite(&v,4,1,f); fwrite("WAVEfmt ",1,8,f); v=16; fwrite(&v,4,1,f);
  s16=1; fwrite(&s16,2,1,f); s16=2; fwrite(&s16,2,1,f); v=sr; fwrite(&v,4,1,f); v=sr*4; fwrite(&v,4,1,f); s16=4; fwrite(&s16,2,1,f); s16=16; fwrite(&s16,2,1,f);
  fwrite("data",1,4,f); v=dataBytes; fwrite(&v,4,1,f);
  for(int i=0;i<n;i++){ float a=L[i]; if(a>1)a=1; if(a<-1)a=-1; s16=(int16_t)(a*32767); fwrite(&s16,2,1,f); a=R[i]; if(a>1)a=1; if(a<-1)a=-1; s16=(int16_t)(a*32767); fwrite(&s16,2,1,f); }
  fclose(f);
}
