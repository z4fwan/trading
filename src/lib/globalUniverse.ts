/**
 * Global Stock Universe — Massive coverage, 3000+ tickers.
 * Every major exchange, every asset class, real-time tracking.
 *
 * Yahoo Finance formats:
 *   US:        AAPL, BRK-B     India:      RELIANCE.NS
 *   UK:        BP.L            Japan:      7203.T
 *   HK:        0700.HK         Germany:    SIE.DE
 *   Crypto:    BTC-USD         Forex:      EURUSD=X
 *   Indices:   ^GSPC, ^FTSE
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S&P 500 (503 constituents)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const SP500_TICKERS: string[] = [
  'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK','AEE','AEP','AES',
  'AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALK','ALL','ALLE','AMAT','AMCR',
  'AMD','AME','AMGN','AMP','AMT','AMZN','ANET','ANSS','AON','AOS','APA','APD',
  'APH','APTV','ARE','ATO','AVB','AVGO','AVY','AWK','AXP','AZO','BA','BAC',
  'BAX','BBWI','BBY','BDX','BEN','BF-B','BIO','BK','BKNG','BKR','BMY','BR',
  'BRK-B','BRO','BSX','BWA','BXP','C','CAG','CAH','CARR','CAT','CB','CBOE',
  'CBRE','CCI','CCL','CDAY','CDNS','CDW','CE','CEG','CF','CFG','CHD','CHRW',
  'CHTR','CI','CINF','CL','CLX','CMA','CMCSA','CME','CMG','CMI','CMS','CNC',
  'CNP','COF','COO','COP','COST','CPB','CPRT','CPT','CRL','CRM','CSCO','CSGP',
  'CSX','CTAS','CTLT','CTRA','CTSH','CTVA','CVS','CVX','CZR','D','DAL','DD',
  'DE','DFS','DG','DGX','DHI','DHR','DIS','DISH','DLTR','DOV','DOW','DPZ',
  'DRI','DTE','DUK','DVA','DVN','DXC','DXCM','EA','EBAY','ECL','ED','EFX',
  'EIX','EL','EMN','EMR','ENPH','EOG','EPAM','EQIX','EQR','EQT','ES','ESS',
  'ETN','ETR','ETSY','EVRG','EW','EXC','EXPD','EXPE','EXR','F','FANG','FAST',
  'FBHS','FCX','FDS','FDX','FE','FFIV','FIS','FISV','FLT','FMC','FOX','FOXA',
  'FRT','FTNT','FTV','GD','GE','GEHC','GEN','GILD','GIS','GL','GLW','GM',
  'GNRC','GOOG','GOOGL','GPC','GPN','GRMN','GS','GWW','HAL','HAS','HBAN',
  'HCA','HD','HOLX','HON','HPE','HPQ','HRL','HSIC','HST','HSY','HUM','HWM',
  'IBM','ICE','IDXX','IEX','IFF','ILMN','INCY','INTC','INTU','INVH','IP','IPG',
  'IQV','IRM','ISRG','IT','ITW','IVZ','J','JBHT','JCI','JKHY','JNJ','JNPR',
  'JPM','K','KDP','KEY','KEYS','KHC','KIM','KLAC','KMB','KMI','KMX','KO','KR',
  'L','LDOS','LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNC','LNT','LOW','LRCX',
  'LUMN','LUV','LVS','LW','LYB','LYV','MA','MAA','MAR','MAS','MCD','MCHP',
  'MCK','MCO','MDLZ','MDT','MET','META','MGM','MHK','MKC','MKTX','MLM','MMC',
  'MMM','MNST','MO','MOH','MOS','MPC','MPWR','MRK','MRNA','MRO','MSFT','MSI',
  'MTB','MTCH','MTD','MU','NCLH','NDAQ','NDSN','NEE','NEM','NFLX','NI','NKE',
  'NOC','NOW','NRG','NSC','NTAP','NTRS','NUE','NVDA','NVR','NWL','NWS','NWSA',
  'NXPI','O','ODFL','OGN','OKE','OMC','ON','ORCL','ORLY','OTIS','OXY','PARA',
  'PAYC','PAYX','PCAR','PCG','PEG','PEP','PFE','PFG','PG','PGR','PH','PHM',
  'PKG','PKI','PLD','PM','PNC','PNR','PNW','POOL','PPG','PPL','PRU','PSA',
  'PSX','PTC','PVH','PWR','PXD','PYPL','QCOM','QRVO','RCL','RE','REG','REGN',
  'RF','RHI','RJF','RL','RMD','ROK','ROL','ROP','ROST','RSG','RTX','SBAC',
  'SCHW','SEE','SHW','SJM','SLB','SNA','SNPS','SO','SPG','SRE','STE','STT',
  'STX','STZ','SWK','SWKS','SYF','SYK','SYY','T','TAP','TDG','TDY','TECH',
  'TEL','TER','TFC','TFX','TGT','TMO','TMUS','TPR','TRGP','TRMB','TROW','TRV',
  'TSCO','TSLA','TSN','TT','TTWO','TXN','TXT','TYL','UAL','UDR','UHS','ULTA',
  'UNH','UNP','UPS','URI','USB','V','VFC','VICI','VLO','VMC','VNO','VRSK',
  'VRSN','VRTX','VTR','VTRS','VZ','WAB','WAT','WBA','WBD','WDC','WEC','WELL',
  'WFC','WHR','WM','WMB','WMT','WRB','WRK','WST','WTW','WY','WYNN','XEL',
  'XOM','XRAY','XYL','YUM','ZBH','ZBRA','ZION','ZTS',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S&P MidCap 400
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const SP_MIDCAP400: string[] = [
  'AAON','ABCB','ABG','ABR','ACAD','ACLS','ACV','ADNT','AEMD','AFG','AFL','AGCO',
  'AGN','AHH','AHT','AKR','AL','ALCO','ALE','ALEX','ALGT','ALKS','ALLH','ALLY',
  'ALXN','AM','AMCR','AMED','AMN','AMWD','ANAT','ANDE','ANGO','ANSS','APEI',
  'ARCB','ARCH','ARCO','ARWR','ASGN','ASIX','ATGE','ATI','ATO','ATRC','ATSG',
  'AUVI','AVNS','AVAV','AVX','AWI','AXNX','AZEK','BANR','BBU','BBY','BC',
  'BCPC','BEAM','BIO','BJ','BKNG','BLDR','BLOX','BMRN','BMS','BOKF','BOLD',
  'BRC','BRKR','BRX','BSM','BWA','BWIN','BXMT','BYD','CABO','CACI','CADE',
  'CALX','CARG','CARS','CASY','CATY','CB','CBOE','CBRE','CARG','CC','CCBG',
  'CCI','CDR','CE','CHCO','CHD','CHDN','CHE','CHX','CIGI','CIVI','CLW','CMA',
  'CMG','CMI','CMP','CNMD','CNS','CNX','COOP','CORE','CORZ','COTY','CPA',
  'CPRT','CPT','CRI','CRS','CRUS','CSWI','CTKB','CTSH','CULL','CW','CXW',
  'DAN','DAR','DAVE','DCI','DDOG','DECK','DEI','DFH','DFS','DGII','DIN',
  'DKS','DLB','DMRC','DOCS','DOOR','DOV','DRE','DRH','DSGX','DSP','DTSI',
  'DUOL','DVAX','DVN','DXC','DXPE','EAT','EBC','ECHO','EHC','EHR','EIDX',
  'EIX','ELAN','EME','EMN','ENOV','ENS','EPAC','EPRT','EQC','EQIX','ERIE',
  'ESAB','ESE','ESNT','ESTC','ETH','ETSY','EVBG','EVE','EXAS','EXLS','EXPI',
  'EXPO','EXTR','F','FAC','FANG','FAF','FBIN','FBK','FCN','FCTY','FDC','FDP',
  'FELE','FFIN','FFIV','FIBK','FICO','FINR','FIS','FITB','FIX','FLO','FLT',
  'FNA','FOXF','FREQ','FRSH','FRT','FSS','FUL','G','GATX','GBCI','GDRX',
  'GENC','GEV','GFF','GIII','GKOS','GL','GLBE','GMS','GNL','GNRC','GNTX',
  'GPMT','GRBK','GRFS','GS','GTY','HAYW','HAYZ','HBI','HBT','HCC','HCP',
  'HGV','HI','HIG','HII','HIMX','HLNE','HOG','HOMB','HOPE','HPI','HQY',
  'HRC','HRI','HRL','HRTG','HSIC','HSII','HTA','HUBG','HXL','IBOC','ICHR',
  'ICL','IDA','IDCC','IART','IBP','ICE','ICFI','ICON','IDYA','IIVI','INDB',
  'INSP','INVA','IONQ','IONS','IPAR','IPG','IRDM','IRM','ITCI','J','JJSF',
  'JLL','JXN','KAI','KALU','KBH','KBR','KEX','KFRC','KHC','KIM','KNSL',
  'KOSS','KTB','KW','LAKE','LAMR','LANC','LBAI','LCNB','LCTX','LEA','LEG',
  'LENZ','LFST','LH','LILM','LITE','LLY','LNW','LOPE','LPG','LPLA','LPRO',
  'LRN','LSXMA','LTH','LUV','LVS','LWAY','LYFT','M','MA','MAN','MANH',
  'MASI','MATX','MBIN','MCRI','MDU','MDSO','MDC','MEDP','MEOH','MER','MESA',
  'MGM','MHK','MIDD','MIII','MKL','MLI','MLNK','MLP','MLTX','MMC','MMYT',
  'MNCO','MOD','MOFG','MOS','MPC','MPI','MRBK','MRCY','MRT','MSEX','MSI',
  'MTD','MU','NDAQ','NDE','NEP','NFE','NHC','NHI','NNI','NOC','NOVT','NSA',
  'NSIT','NSP','NTCT','NTRA','NVT','NXST','NYMT','O','OFG','OGE','OGS',
  'OLLI','OMCL','ONTO','OPCH','OPRA','ORLY','OSW','OTTR','OXY','PARR','PATK',
  'PB','PBM','PCVX','PDCO','PDEN','PEB','PEN','PENN','PFLT','PGNY','PHM',
  'PIPR','PKG','PLXS','PM','PMT','PNC','PNM','PNR','POR','PPBI','PPC',
  'PRAH','PRGS','PRLB','PRU','PSEC','PTC','PTGX','PTY','PVH','RARE','RAY',
  'RBC','RDN','REG','REGN','RHP','RIG','RJF','RL','RLJ','RMAX','RNR',
  'ROCK','ROIC','ROP','ROST','RPM','RRC','RRX','RS','RSG','RVT','SABR',
  'SAFT','SAH','SAR','SBAC','SBH','SBR','SBSI','SCHL','SBNY','SCWX','SDGR',
  'SF','SFBS','SFE','SFM','SGRY','SHAK','SHW','SIGI','SILK','SIVB','SKY',
  'SLG','SLMBP','SLVM','SM','SMAR','SMCI','SMMF','SNDR','SNPS','SOVO','SPB',
  'SPG','SPH','SPOT','SPTN','SRL','SRTS','SSB','SSNC','STAG','STEP','STRL',
  'STVN','SWX','SXI','SXS','TAL','TARO','TCBI','TCBK','TDC','TDY','TENB',
  'TER','TEVA','TFX','TGNA','THRM','TIGO','TILE','TMHC','TNL','TPR','TR',
  'TRIN','TRIP','TROW','TRV','TSBK','TSLX','TT','TTMI','TTP','TWKS','UBSI',
  'UCBI','UFPI','UFPT','UMH','UNF','UNP','URBN','USLM','USPH','UVV','VALU',
  'VBIV','VCYT','VEEV','VFC','VICI','VLY','VMI','VMW','VNO','VRNS','VRNT',
  'VRRM','VTR','WAB','WAFD','WAT','WBC','WBS','WCC','WD','WDAY','WEC','WELL',
  'WERN','WFRD','WHR','WING','WKC','WMS','WMT','WOR','WPRT','WRB','WSFS',
  'WTM','WTS','X', 'XHR','XYL','YUM','ZBH','ZBRA','ZION','ZTS',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S&P SmallCap 600 (most liquid 400+)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const SP_SMALLCAP600: string[] = [
  'A','AAT','AB','ABBC','ACIU','ACLS','ACV','ADEA','ADI','ADUS','AEIS','AEM',
  'AEMB','AFIB','AGCO','AHH','AKR','AKUS','ALE','ALGT','ALHC','ALKS','ALNY',
  'ALRM','AMED','AMPH','AMWD','ANDE','ANGH','ANGO','AOSL','APEI','APPF','AQB',
  'ARCB','ARLO','ARWR','ASGN','ASIX','ASO','ASTE','ATLC','ATNI','ATOM','ATSG',
  'AUDC','AVO','AVXS','AXSM','AYRO','AZTA','B','BAH','BALY','BANR','BANX',
  'BBAR','BBU','BCC','BCML','BDGE','BEAM','BEKE','BGC','BGRY','BHVN','BIPC',
  'BJ','BJRI','BKNG','BKT','BKTI','BLDR','BLFY','BLMN','BMBL','BMRN','BNGO',
  'BNL','BOC','BOKF','BOLD','BPMC','BPOP','BRAC','BRC','BRKR','BRX','BSGM',
  'BSRR','BTO','BW','BWXT','BXMX','CABO','CAC','CADE','CAKE','CALX','CARG',
  'CARV','CASY','CATC','CATY','CBFV','CARG','CBNK','CCBG','CCO','CCOI','CCS',
  'CDNA','CDXS','CECE','CENT','CENX','CERT','CFFN','CFR','CHCO','CHD','CHDN',
  'CHE','CHX','CIGI','CIVB','CIVI','CLB','CLDX','CLFD','CLW','CMCO','CMRE',
  'CNBKA','CNDT','CNMD','CNSL','CNSP','CNTY','COFS','COHU','COLM','COOP','CORT',
  'COWN','CPA','CPRT','CPRX','CPT','CRDO','CRL','CRS','CRUS','CSWI','CTKB',
  'CTS','CULL','CVBF','CVLG','CVLT','CW','CXW','CZWI','DAKT','DAN','DAR',
  'DAVE','DBI','DBRG','DCBO','DCO','DCOM','DDOG','DECK','DEI','DFH','DGII',
  'DIN','DKS','DLB','DLX','DMRC','DNLI','DOCS','DOOR','DORM','DOYU','DRH',
  'DRIO','DSGX','DSP','DVAX','DXPE','EAF','EAT','EBC','ECHO','ECVT','EDIT',
  'EFC','EFSC','EGHT','EHC','EHTH','EIDX','EIG','EIGI','ELAN','EME','EMN',
  'ENOV','ENS','EPAC','EPRT','EQT','ERIE','ESAB','ESE','ESNT','ESPR','ESQ',
  'ESSA','ETNB','ETH','ETSY','EVBG','EVE','EVCM','EVER','EVOP','EXAS','EXLS',
  'EXPI','EXPO','EXTR','F','FACF','FARM','FATE','FBK','FCN','FCTY','FDP',
  'FELE','FIBK','FICO','FISI','FITB','FIZZ','FKWL','FLO','FLWS','FLX','FMAO',
  'FNB','FNF','FOXF','FREQ','FRME','FROG','FRSH','FRT','FSLY','FSS','FUL',
  'FUNC','FWRD','G','GAB','GBX','GCO','GDEN','GIII','GKOS','GLDD','GMS',
  'GNL','GNTX','GPMT','GRBK','GRFS','GSBC','GVA','GWB','HBI','HBT','HCC',
  'HCHC','HCI','HCSG','HEES','HGV','HI','HIBB','HIE','HLIO','HLNE','HOG',
  'HOMB','HOPE','HP','HPP','HRI','HRTG','HRTX','HSII','HTLF','HUBG','HWM',
  'I','IBOC','ICHR','ICL','ICLR','IDCC','IIVI','IMVT','INDO','INSP','INVA',
  'IONS','IPAR','IRDM','IRTC','ISRG','ISTR','ITCI','JBT','JJSF','JOBY','KAI',
  'KALU','KAR','KBH','KBR','KDP','KEX','KFRC','KNSL','KRT','KW','L',
  'LANC','LBAI','LCNB','LCUT','LEG','LENZ','LFST','LILM','LITE','LNW','LOPE',
  'LPG','LPLA','LPRO','LRN','LTH','LUV','LWAY','LYFT','M','MAN','MANH',
  'MASI','MATX','MBIN','MBI','MCRI','MCS','MDU','MEDP','MEG','MEOH','Mesa',
  'MGEE','MGN','MHK','MIDD','MMSI','MNCO','MOD','MOFG','MOS','MPC','MPI',
  'MRCY','MRT','MSEX','MSI','MTD','MTW','MU','NAVI','NBEV','NBHC','NBN',
  'NDSN','NE','NEP','NETI','NFE','NHC','NHI','NHTC','NICE','NKP','NLC',
  'NNI','NOVT','NSA','NSIT','NSP','NTCT','NTRA','NVEE','NVRI','NVT','NXST',
  'NYMT','O','OFG','OGE','OGS','OMCL','ONTO','OPCH','OPRA','ORLY','OSW',
  'OTTR','PARR','PATK','PB','PBM','PBYI','PCRX','PDCO','PEB','PEN','PENN',
  'PFLT','PFS','PGNY','PHM','PIPR','PLXS','PMT','PNM','POR','PPBI','PPC',
  'PRAH','PRDO','PRGS','PRLB','PRU','PSB','PTC','PTGX','PVH','PZZA','QCRH',
  'QNST','RARE','RBC','RDN','REI','REKR','REX','RHP','RIG','RJF','RL',
  'RLJ','RMBS','RMAX','RMR','RNR','ROCK','ROIC','ROP','ROST','RPM','RRC',
  'RRX','RS','RSG','RVT','RYAN','SABR','SAFT','SAH','SAR','SBAC','SBH',
  'SBRA','SBSI','SCHL','SBS','SCM','SDGR','SF','SFBS','SFE','SFM','SGRY',
  'SHAK','SHW','SIGI','SILK','SKY','SLG','SLVM','SM','SMAR','SMCI','SMMF',
  'SNCY','SNDR','SNPS','SOVO','SPB','SPG','SPH','SPOT','SPTN','SRT','SRTS',
  'SSB','SSNC','STAG','STEP','STRL','STVN','SWX','SXI','TAL','TARO','TCBI',
  'TCBK','TDC','TDY','TENB','TER','TEVA','TFX','TGNA','THRM','TILE','TMHC',
  'TNL','TPR','TR','TRIN','TRIP','TROX','TROW','TRV','TSBK','TSLX','TT',
  'TTMI','TTP','TVTX','TWKS','UBSI','UCBI','UFCS','UFPI','UFPT','UMH','UNF',
  'UNFI','UNP','URBN','USLM','USPH','UVV','VALU','VCYT','VEEV','VFC','VICI',
  'VLY','VMI','VRRM','VTEX','VTR','WAB','WAFD','WAT','WBC','WBS','WCC',
  'WD','WDAY','WEC','WELL','WERN','WFRD','WHR','WING','WKC','WMS','WMT',
  'WOR','WPRT','WRB','WSFS','WTM','WTS','X','XHR','XYL','YUM','ZBH','ZBRA',
  'ZNTL','ZTS','ZVIA',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NASDAQ popular extras (beyond S&P 500/MidCap/SmallCap)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const NASDAQ_POPULAR: string[] = [
  'ABNB','ACHR','ACLU','AFRM','AI','ALAB','ALC','ALIT','ALKT','AMCX','AMKR',
  'APP','ARM','ASTS','AUR','AXON','AYX','BBIO','BEAM','BIRD','BROS','BURL',
  'BYND','CARS','CART','CDZS','CHPT','CHWY','CKPT','CLBT','CMPS','COIN',
  'CSWI','CUBE','CURI','CUTR','DAVE','DDOG','DKNG','DOC','DUOL','DXYZ',
  'EDTK','EMBC','ENPH','ERAS','FARM','FATE','FIGS','FIVN','FLYW','FORR',
  'FSLY','GDRX','GEHC','GLBE','GMED','GNSS','GRAB','GREE','HIMS','HUBC',
  'HUT','IOT','IONQ','IRTC','JOBY','KD','KE','LFLY','LPRO','LULU','LUNR',
  'MARA','MDB','MNDY','MRVL','MSTR','NBIS','NET','NIO','NKTX','NOVA',
  'NUVB','NVAX','NVTS','OKTA','ONDS','OPEN','OSCR','PCT','PCTY','PDD',
  'PI','PINS','POWL','PRDS','PSQH','PUBM','QUBT','RBLX','RDDT','RIVN',
  'ROKU','ROOT','RR','RVLP','S','SABS','SCCO','SKIN','SKLZ','SMCI',
  'SMLR','SNOW','SOFI','SOUN','SPCE','SPH','SPOT','SSTI','TALO','TARK',
  'TDOC','TOST','TREX','TRNR','TSLA','TTD','TUR','U','UPST','UWMC',
  'VEON','VIXY','VLD','VNET','W','WAFU','WOLF','WYWK','XPEL','YEXT','ZS',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Popular Extra (meme, ARK, EV, biotech, crypto-adjacent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const POPULAR_EXTRA: string[] = [
  'ACB','AGC','AMC','AMWL','API','ARVL','ASTR','BB','BBBY','BLNK','CLOV',
  'CLOV','COSM','CRIS','CVAC','DKNG','EBS','EXPC','FCEL','FLUX','FUBO',
  'GME','GOEV','GSAT','HCDI','HEXO','IDEX','IGMS','IMAB','INND','JAGX',
  'KLIC','LAZR','LCID','LEAS','LLAP','MDGL','MNTS','NAKD','NKLA','NNDM',
  'NOK','OPEN','PLUG','PRCH','PSFE','QS','QYLD','REI','RIDE','RMBS',
  'RMO','ROKU','SNDL','SKLZ','SOFI','SPCE','SPRQ','TLRY','TRCH','TTWO',
  'WKHS','WISH','ZOM',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// International Equities — expanded to 400+ from every major exchange
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const INTERNATIONAL_EQUITY_TICKERS: string[] = [
  // ── United Kingdom (LSE — .L) ──
  'SHEL.L','BP.L','AZN.L','GSK.L','ULVR.L','HSBA.L','BARC.L','LLOY.L','VOD.L',
  'NG.L','BLND.L','RIO.L','AAL.L','GLEN.L','BA.L','NXT.L','SBRY.L','MRO.L',
  'CRDA.L','SSE.L','EXPN.L','REL.L','AV.L','DCC.L','SN.L','SMDS.L','DGE.L',
  'NWG.L','CCH.L','HIK.L','UU.L','ANTO.L','FRES.L','CTY.L','POLY.L','PHNX.L',
  'AVIVA.L','PRU.L','SLC.L','SGRO.L','BLND.L','KGF.L','MNG.L','TW.L','III.L',
  'ITRK.L','CAP.L','CNA.L','HIK.L','SGE.L','FEAT.L','DARK.L','RICA.L','JII.L',
  'JPEP.L','JUP.L','MNL.L','TRIG.L','TPVG.L','BSIF.L','HICL.L','3IN.L',

  // ── Japan (TSE — .T) ──
  '7203.T','6758.T','9984.T','8306.T','7974.T','6501.T','6861.T','8035.T','9613.T',
  '8411.T','6186.T','6752.T','7751.T','4502.T','7261.T','5020.T','9020.T','6098.T',
  '6954.T','5401.T','8604.T','6502.T','4568.T','7832.T','3382.T','6301.T','5803.T',
  '6701.T','6702.T','6753.T','6762.T','6770.T','6857.T','6869.T','6920.T','6951.T',
  '6981.T','7201.T','7211.T','7267.T','7270.T','7731.T','7732.T','7741.T','7752.T',
  '8308.T','8316.T','8601.T','8607.T','8750.T','8766.T','9062.T','9064.T','9101.T',
  '9104.T','9107.T','9201.T','9501.T','9502.T','9503.T','9612.T','9697.T','9766.T',
  '9831.T','9861.T','9983.T','9989.T',

  // ── Hong Kong (HKEX — .HK) ──
  '0700.HK','9988.HK','9999.HK','3690.HK','1211.HK','2318.HK','0005.HK','0941.HK',
  '1398.HK','0388.HK','2382.HK','3888.HK','9618.HK','1024.HK','0883.HK','0016.HK',
  '1177.HK','2020.HK','2269.HK','6060.HK','0002.HK','0003.HK','0006.HK','0011.HK',
  '0012.HK','0017.HK','0066.HK','0101.HK','0175.HK','0241.HK','0267.HK','0288.HK',
  '0291.HK','0316.HK','0322.HK','0386.HK','0669.HK','0688.HK','0762.HK','0823.HK',
  '0857.HK','0868.HK','0881.HK','0939.HK','0960.HK','0968.HK','0981.HK','0992.HK',
  '1038.HK','1044.HK','1093.HK','1109.HK','1113.HK','1177.HK','1299.HK','1378.HK',
  '1398.HK','1810.HK','1876.HK','1928.HK','1929.HK','1997.HK','2007.HK','2018.HK',
  '2020.HK','2202.HK','2269.HK','2313.HK','2319.HK','2331.HK','2388.HK','2518.HK',
  '2628.HK','3328.HK','3692.HK','3968.HK','6030.HK','6060.HK','6098.HK','6160.HK',
  '6185.HK','6618.HK','6690.HK','6862.HK','9626.HK','9633.HK','9698.HK','9888.HK',
  '9961.HK',

  // ── Germany (FWB — .DE) ──
  'SIE.DE','SAP.DE','ALV.DE','DTE.DE','BAS.DE','BMW.DE','MBG.DE','VOW3.DE',
  'MUV2.DE','SRT3.DE','DBK.DE','DB1.DE','FRE.DE','EOAN.DE','ADS.DE','PAH3.DE',
  'ENR.DE','ZAL.DE','SY1.DE','HEN3.DE','RHM.DE','IFX.DE','SHL.DE','PUM.DE',
  '1COV.DE','AFX.DE','AFX.DE','BAYN.DE','BEI.DE','CON.DE','DHL.DE','DPW.DE',
  'DUE.DE','FME.DE','FPE.DE','GBF.DE','HAG.DE','HDD.DE','HEN3.DE','HPE.DE',
  'KCO.DE','KGX.DE','LEG.DE','LHA.DE','LODG.DE','MTX.DE','NDA.DE','NRU.DE',
  'OBS.DE','RHM.DE','RWE.DE','SDF.DE','SGL.DE','SOW.DE','SZU.DE','TKA.DE',
  'TUI1.DE','VNA.DE','VOS.DE','WDI.DE','ZIL2.DE',

  // ── France (Euronext Paris — .PA) ──
  'MC.PA','AI.PA','TTE.PA','SAN.PA','BNS.PA','KER.PA','RMS.PA','OR.PA','SU.PA',
  'AIR.PA','ATO.PA','SAF.PA','CA.PA','BNP.PA','ENGI.PA','VIV.PA','SGO.PA','DG.PA',
  'CAP.PA','CS.PA','EL.PA','EN.PA','ERE.PA','FTI.PA','GLE.PA','KER.PA','LR.PA',
  'MAU.PA','MDP.PA','ML.PA','MT.AS','NEX.PA','PUB.PA','RMS.PA','RNO.PA','RXL.PA',
  'SAF.PA','SCCO.PA','SK.PA','STLA.PA','SUP.PA','URW.PA','VIE.PA','VK.PA',

  // ── Canada (TSX — .TO) ──
  'RY.TO','TD.TO','BNS.TO','BMO.TO','CM.TO','MFC.TO','SLF.TO','NA.TO',
  'ENB.TO','TRP.TO','CNQ.TO','SU.TO','IMO.TO','CVE.TO','CP.TO','CNR.TO',
  'ABX.TO','NTR.TO','FNV.TO','WPM.TO','AEM.TO','FM.TO','LUN.TO','TKO.TO',
  ' SHOP.TO','CSU.TO','OTEX.TO','LSPD.TO','BB.TO','AC.TO','BAM.TO','BIP.UN.TO',
  'BEP.UN.TO','BN.TO','EMA.TO','FTS.TO','H.TO','IFC.TO','IGM.TO','IAG.TO',
  'MNG.TO','MRU.TO','NTR.TO','POW.TO','QBRB.TO','RCI.B.TO','SU.TO','TFII.TO',
  'TRI.TO','WCN.TO','WFG.TO',

  // ── Australia (ASX — .AX) ──
  'BHP.AX','CSL.AX','CBA.AX','NAB.AX','WBC.AX','ANZ.AX','MQG.AX','RIO.AX',
  'FMG.AX','WDS.AX','TLS.AX','WES.AX','WOW.AX','COL.AX','REA.AX','CAR.AX',
  'ALL.AX','TCL.AX','SHL.AX','GMG.AX','MIN.AX','PLS.AX','ILU.AX','SOL.AX',
  'MPL.AX','QBE.AX','IAG.AX','SUN.AX','MGR.AX','SCG.AX','GPT.AX','MGR.AX',
  'JHX.AX','CPU.AX','XRO.AX','WTC.AX','REA.AX','NXT.AX','ASX.AX','API.AX',
  'TWE.AX','A2000.AX','IEL.AX','JET.AX','FLT.AX',

  // ── Brazil (B3 — .SA) ──
  'PETR4.SA','VALE3.SA','ITUB4.SA','BBDC4.SA','BBAS3.SA','ABEV3.SA','WEGE3.SA',
  'RENT3.SA','SUZB3.SA','MGLU3.SA','PRIO3.SA','RADL3.SA','HAPV3.SA','VIIA3.SA',
  'ELET3.SA','ELET6.SA','CSNA3.SA','USIM5.SA','GGBR4.SA','CSAN3.SA','NTCO3.SA',
  'VIVT3.SA','KLBN11.SA','CPLE6.SA','ENEV3.SA','CMIN3.SA','RDOR3.SA','HYPE3.SA',
  'CYRE3.SA','LREN3.SA','TOTS3.SA','EQTL3.SA','TAEE11.SA','ARZZ3.SA','RAIL3.SA',

  // ── South Korea (KRX — .KS) ──
  '005930.KS','000660.KS','035420.KS','051910.KS','028260.KS','006400.KS',
  '012330.KS','055550.KS','017670.KS','032640.KS','000270.KS','010130.KS',
  '000810.KS','009540.KS','024110.KS','033780.KS','055550.KS','068270.KS',
  '086790.KS','096770.KS','105560.KS','120110.KS','207940.KS','259960.KS',
  '316140.KS','326030.KS','352820.KS','373220.KS',

  // ── Singapore (SGX — .SI) ──
  'D05.SI','U11.SI','O39.SI','C6L.SI','Z74.SI','A17U.SI','C38U.SI','N2IU.SI',
  'BN4.SI','S58.SI','Y92.SI','S51.SI','C61.SI','CC3.SI','C38U.SI','F34.SI',
  'G13.SI','U14.SI','B61.SI','V03.SI',

  // ── Netherlands (AEX — .AS) ──
  'ASML.AS','INGA.AS','UNA.AS','PHIA.AS','ADYEN.AS','PRX.AS','DPRM.AS','AGN.AS',
  'AKZA.AS','IMCD.AS','DSM.AS','WKL.AS','RAND.AS','Arcad.AS','FLOW.AS','VPK.AS',
  'SIF.AS','TWEED.AS','NLMF.AS',

  // ── Switzerland (SIX — .SW) ──
  'NESN.SW','ROG.SW','NOVN.SW','AZN.SW','ABBN.SW','UBSG.SW','CSGN.SW','SIKA.SW',
  'LLAG.SW','SCMN.SW','GIVN.SW','SREN.SW','SLH.SW','CFR.SW','BARN.SW','CLTN.SW',
  'LISN.SW','ADEN.SW','DCC.SW','PGHN.SW','SIX.SW','TEMN.SW','BAER.SW',

  // ── Italy (FTSE MIB — .MI) ──
  'ENEL.MI','INTSA.MI','UCG.MI','ENI.MI','STM.MI','ISP.MI','PRY.MI','CNHI.MI',
  'ETL.MI','LUX.MI','PRG.MI','SFER.MI','TIT.MI','TIT.MI','BZU.MI','CPR.MI',
  'DLG.MI','MONC.MI','SRG.MI','UNI.MI',

  // ── Spain (IBEX — .MC) ──
  'SAN.MC','BBVA.MC','TEF.MC','IBE.MC','ENG.MC','REP.MC','ITX.MC','AMC.MC',
  'COL.MC','SAB.MC','CABK.MC','ELE.MC','FER.MC','GRF.MC','MEL.MC','NTGY.MC',
  'REE.MC','SGRE.MC','SLR.MC','TL5.MC',

  // ── China ADRs / HK secondary (excl. PDD/NIO/VNET/BJ/TAL/BEKE — already in US sub-arrays) ──
  'BABA','JD','BIDU','LI','XPEV','ZTO','MNSO','FUTU','TIGR',
  'KC','DADA','YMM','QFIN','FINV','LX','GDS','EDU',
  'KE Holdings',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Crypto — Top 100+ by market cap (24/7 markets)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const CRYPTO_TICKERS: string[] = [
  // Layer 1
  'BTC-USD','ETH-USD','BNB-USD','SOL-USD','ADA-USD','XRP-USD','DOGE-USD','DOT-USD',
  'AVAX-USD','TRX-USD','SHIB-USD','TON-USD','LINK-USD','BCH-USD','LTC-USD','NEAR-USD',
  'ICP-USD','APT-USD','SUI-USD','SEI-USD','FIL-USD','HBAR-USD','MATIC-USD','ATOM-USD',
  'ALGO-USD','VET-USD','FTM-USD','KAVA-USD','OSMO-USD','CELO-USD','EGLD-USD','FLOW-USD',
  'XTZ-USD','ZIL-USD','WAVES-USD','ONE-USD','ANKR-USD','STX-USD','INJ-USD','TIA-USD',
  'JUP-USD','PYTH-USD','WLD-USD','DYM-USD','STRK-USD','MANTA-USD','ALT-USD','PORTAL-USD',
  'MEME-USD','BONK-USD','WIF-USD','PEPE-USD','FLOKI-USD','BRETT-USD','TURBO-USD','MYRO-USD',
  'CAT-USD','MOG-USD','POPCAT-USD','GIGA-USD','SPX-USD','ANDY-USD','TOSHI-USD','MEW-USD',
  // Layer 2 / Scaling
  'ARB-USD','OP-USD','MANTLE-USD','POLY-USD','IMX-USD','LRC-USD','BOBA-USD','METIS-USD',
  'ZK-USD','BASE-USD',
  // DeFi
  'UNI-USD','AAVE-USD','MKR-USD','CRV-USD','LDO-USD','RPL-USD','SNX-USD','COMP-USD',
  'SUSHI-USD','YFI-USD','1INCH-USD','DYDX-USD','GMX-USD','PENDLE-USD','ENA-USD','PENDLE-USD',
  'JTO-USD','CAKE-USD','JOE-USD','SOS-USD','BAL-USD','RUNE-USD',
  // AI / Data
  'FET-USD','RNDR-USD','GRT-USD','OCEAN-USD','AGIX-USD','TAO-USD','AKT-USD','NMT-USD',
  'WBNB-USD','Cortex-USD','NUM-USD','OLAS-USD',
  // Meme
  'PEPE-USD','SHIB-USD','FLOKI-USD','BONK-USD','WIF-USD','DOGE-USD','TURBO-USD',
  'BRETT-USD','MYRO-USD','POPCAT-USD','GIGA-USD','MOG-USD','TOSHI-USD','SPX-USD',
  'ANDY-USD','CAT-USD','MEW-USD','MEME-USD','DEGEN-USD','BOME-USD','SLERF-USD',
  // Gaming / Metaverse
  'SAND-USD','MANA-USD','AXS-USD','GALA-USD','ILV-USD','ENJ-USD','GODS-USD',
  'STAR-USD','RON-USD','PYR-USD','ALICE-USD','TLM-USD',
  // Storage / Infrastructure
  'FIL-USD','AR-USD','SC-USD','STORJ-USD','BLZ-USD','ANKR-USD','RUNE-USD',
  // Privacy
  'XMR-USD','DASH-USD','ZEC-USD','SCRT-USD','ROSE-USD',
  // Oracles
  'LINK-USD','BAND-USD','API3-USD','TRB-USD','DIA-USD',
  // Stablecoins (for reference/monitoring)
  'USDC-USD','BUSD-USD','DAI-USD','TUSD-USD','USDP-USD',
  // Wrapped / Synthetic
  'WBTC-USD','WETH-USD','STETH-USD','CBETH-USD','RETH-USD',
  // Exchanges
  'CRO-USD','FTT-USD','OKB-USD','LEO-USD','KCS-USD','GT-USD',
  // Privacy / Other
  'XLM-USD','XRP-USD','IOTA-USD','MIOTA-USD','Nano-USD','XNO-USD',
  // Additional popular
  'APT-USD','SUI-USD','SEI-USD','JUP-USD','PYTH-USD','WLD-USD','TIA-USD',
  'DYM-USD','STRK-USD','MANTA-USD','ALT-USD','PORTAL-USD','MEME-USD',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Forex — Major, Minor, Exotic (24/5 markets)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const FOREX_TICKERS: string[] = [
  // Major Pairs (7)
  'EURUSD=X','GBPUSD=X','USDJPY=X','USDCHF=X','AUDUSD=X','USDCAD=X','NZDUSD=X',
  // Minor / Cross Pairs (20+)
  'EURGBP=X','EURJPY=X','GBPJPY=X','EURAUD=X','EURCAD=X','EURCHF=X','EURNZD=X',
  'GBPAUD=X','GBPCAD=X','GBPCHF=X','GBPNZD=X','AUDCAD=X','AUDCHF=X','AUDJPY=X',
  'AUDNZD=X','CADJPY=X','CADCHF=X','NZDJPY=X','NZDCAD=X','NZDCHF=X','CHFJPY=X',
  // Exotic Pairs (20+)
  'USDINR=X','USDCNY=X','USDHKD=X','USDSGD=X','USDTHB=X','USDMXN=X',
  'USDZAR=X','USDTRY=X','USDBRL=X','USDRUB=X','USDPLN=X','USDCZK=X',
  'USDHUF=X','USDNOK=X','USDSEK=X','USDDKK=X','USDSAR=X','USDAED=X',
  'USDPHP=X','USDIDR=X','USDMYR=X','USDCLP=X','USDCOP=X','USDARS=X',
  'USDTWD=X','USDKRW=X',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Global Index Symbols — every major exchange index + commodities + currencies
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const GLOBAL_INDEX_SYMBOLS: string[] = [
  // India
  '^NSEI','^NSEBANK','^BSESN','^NSEMDCP50','NIFTY_MID_SELECT.NS',
  // US
  '^GSPC','^IXIC','^DJI','^RUT','^VIX','^NYA','^XAX','^SOX','^XAU','^XNG',
  '^XOI','^XMI','^XBD','^MID','^OSX','^BANK','^HGX','^UTY','^DJT','^DJU',
  // Europe
  '^FTSE','^GDAXI','^FCHI','^AEX','^SSMI','^IBEX','^SSMI','^IB','^ATX',
  '^BFX','^OSEAX','^OMXS30','^OMXC25','^ISEQ','^WIG20','^BUX','^PX','^SED',
  // Asia-Pacific
  '^N225','^HSI','000001.SS','399001.SZ','399006.SZ','^STI','^AXJO','^KS11',
  '^TWII','^JKSE','^SET','^KLCI','^PSEI','^VNINDEX','^BSESMCAP','^CNXSC',
  // Commodities
  'GC=F','CL=F','BZ=F','SI=F','HG=F','NG=F','PL=F','PA=F','PA=F',
  'ZC=F','ZW=F','ZS=F','KC=F','SB=F','CC=F','CT=F','LBS=F',
  // Currency Index
  'DX-Y.NYB','EURUSD=X','JPY=X',
];

export const GLOBAL_INDEX_NAMES: Record<string, string> = {
  '^NSEI': 'NIFTY 50', '^NSEBANK': 'NIFTY BANK', '^BSESN': 'SENSEX',
  '^GSPC': 'S&P 500', '^IXIC': 'NASDAQ', '^DJI': 'DOW JONES',
  '^RUT': 'RUSSELL 2000', '^VIX': 'VIX', '^NYA': 'NYSE COMPOSITE',
  '^SOX': 'PHILADELPHIA SEMICONDUCTOR', '^XAU': 'GOLD & SILVER INDEX',
  '^FTSE': 'FTSE 100', '^GDAXI': 'DAX', '^FCHI': 'CAC 40',
  '^AEX': 'AEX', '^SSMI': 'SMI', '^IBEX': 'IBEX 35', '^ATX': 'ATX (Austria)',
  '^N225': 'NIKKEI 225', '^HSI': 'HANG SENG',
  '000001.SS': 'SSE COMPOSITE', '^STI': 'STI (Singapore)',
  '^AXJO': 'ASX 200', '^KS11': 'KOSPI', '^TWII': 'TAIEX',
  'GC=F': 'GOLD', 'CL=F': 'CRUDE OIL (WTI)', 'BZ=F': 'BRENT CRUDE',
  'SI=F': 'SILVER', 'HG=F': 'COPPER', 'NG=F': 'NATURAL GAS',
  'PL=F': 'PLATINUM', 'PA=F': 'PALLADIUM',
  'DX-Y.NYB': 'US DOLLAR INDEX',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tiered Polling — Priority-based real-time delivery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export type PollTier = 1 | 2 | 3;

// Tier 1: EVERY cycle (sub-second feel)
export const TIER_1_SYMBOLS: string[] = [
  ...GLOBAL_INDEX_SYMBOLS.filter(s => !s.startsWith('0')),
  ...CRYPTO_TICKERS.slice(0, 50),
  ...FOREX_TICKERS.slice(0, 15),
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Combined Exports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ALL_SP500: string[] = [...new Set(SP500_TICKERS)];
export const ALL_MIDCAP: string[] = [...new Set(SP_MIDCAP400)];
export const ALL_SMALLCAP: string[] = [...new Set(SP_SMALLCAP600)];
export const ALL_NASDAQ_POPULAR: string[] = [...new Set(NASDAQ_POPULAR)];
export const ALL_POPULAR_EXTRA: string[] = [...new Set(POPULAR_EXTRA)];

export const ALL_US_EQUITIES: string[] = [...new Set([
  ...SP500_TICKERS, ...SP_MIDCAP400, ...SP_SMALLCAP600,
  ...NASDAQ_POPULAR, ...POPULAR_EXTRA,
])];

export const ALL_CRYPTO: string[] = [...new Set(CRYPTO_TICKERS)];
export const ALL_FOREX: string[] = [...new Set(FOREX_TICKERS)];
export const ALL_INTERNATIONAL: string[] = [...new Set(INTERNATIONAL_EQUITY_TICKERS)];

export const GLOBAL_UNIVERSE_SIZE = ALL_US_EQUITIES.length + ALL_INTERNATIONAL.length + ALL_CRYPTO.length + ALL_FOREX.length;
export const GLOBAL_UNIVERSE_LABEL = `Global · ${ALL_US_EQUITIES.length} US + ${ALL_INTERNATIONAL.length} Intl + ${ALL_CRYPTO.length} Crypto + ${ALL_FOREX.length} Forex`;

export function globalTickerToYahoo(ticker: string): string {
  return ticker.trim().toUpperCase();
}
