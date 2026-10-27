# Predictive Maintenance — 3-нұсқа, зертханалық №6–9
# Google Colab: алдымен %pip install pandas numpy scikit-learn matplotlib joblib
import json, joblib, numpy as np, pandas as pd, matplotlib.pyplot as plt
from pathlib import Path
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score, learning_curve
from sklearn.base import clone
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, accuracy_score, f1_score, classification_report, confusion_matrix
from sklearn.neural_network import MLPClassifier

ROOT=Path("predictive_maintenance")
for p in ("data","models","reports"): (ROOT/p).mkdir(parents=True,exist_ok=True)
SEED=1
CLASSES=["қалыпты","қауіп","ақау"]
NUM=["temperature","vibration","work_hours","pressure","maintenance_days"]
CAT=["equipment_type"]
FEATURES=NUM+CAT
rng=np.random.default_rng(SEED)

# ========== №6: ДЕРЕКТЕРДІ ДАЙЫНДАУ ==========
raw=ROOT/"data/raw.csv"
if raw.exists():
    df=pd.read_csv(raw)
else:
    n=300
    df=pd.DataFrame({
      "temperature":rng.uniform(30,110,n).round(2),
      "vibration":rng.uniform(.2,10,n).round(2),
      "work_hours":rng.integers(0,20001,n),
      "pressure":rng.uniform(2,10,n).round(2),
      "maintenance_days":rng.integers(0,366,n),
      "equipment_type":rng.choice(["pump","compressor","motor"],n)})
    score=((df.temperature>80).astype(int)+(df.vibration>6).astype(int)
           +(df.work_hours>14000).astype(int)
           +((df.pressure<3)|(df.pressure>8)).astype(int)
           +(df.maintenance_days>240).astype(int))
    df["state"]=np.select([score>=3,score>=2],["ақау","қауіп"],default="қалыпты")
    df.to_csv(raw,index=False,encoding="utf-8-sig")
assert set(FEATURES+["state"]).issubset(df.columns)
work=df.drop_duplicates().reset_index(drop=True).copy()
for c in NUM:
    work[c]=pd.to_numeric(work[c],errors="coerce").replace([np.inf,-np.inf],np.nan)
work[CAT]=work[CAT].replace(r"^\s*$",np.nan,regex=True)
# Бұрынғы №6 сияқты кемінде 5% бос ұяшық, 3% диапазон қатесі
matrix=work[FEATURES].to_numpy(dtype=object)
needed=max(0,int(np.ceil(matrix.size*.05))-int(pd.isna(matrix).sum()))
if needed:
    ids=rng.choice(np.flatnonzero(~pd.isna(matrix).ravel()),size=needed,replace=False)
    matrix.ravel()[ids]=np.nan
    work[FEATURES]=pd.DataFrame(matrix,columns=FEATURES)
for c in NUM: work[c]=pd.to_numeric(work[c],errors="coerce")
limits={"temperature":(0,150),"vibration":(0,20),"work_hours":(0,100000),"pressure":(0,20),"maintenance_days":(0,3650)}
invalid=pd.Series(False,index=work.index)
for c,(lo,hi) in limits.items(): invalid|=work[c].notna()&~work[c].between(lo,hi)
need=max(0,int(np.ceil(len(work)*.03))-int(invalid.sum()))
if need:
    candidates=work.index[~invalid&work.temperature.notna()]
    if len(candidates)>=need:
        work.loc[rng.choice(candidates,size=need,replace=False),"temperature"]=999
quality=[]
for c,(lo,hi) in limits.items():
    bad=work[c].notna()&~work[c].between(lo,hi)
    quality.append({"feature":c,"missing_before":int(work[c].isna().sum()),"invalid":int(bad.sum())})
    work.loc[bad,c]=np.nan
pd.DataFrame(quality).to_csv(ROOT/"reports/data_quality.csv",index=False)
Xtr_raw,Xte_raw,ytr,yte=train_test_split(work[FEATURES],work["state"],test_size=.25,stratify=work["state"],random_state=SEED)
pre=ColumnTransformer([
    ("num",Pipeline([("imputer",SimpleImputer(strategy="median")),("scaler",StandardScaler())]),NUM),
    ("cat",Pipeline([("imputer",SimpleImputer(strategy="most_frequent")),("encoder",OneHotEncoder(handle_unknown="ignore",sparse_output=False))]),CAT)
],verbose_feature_names_out=False)
Xtr=pd.DataFrame(pre.fit_transform(Xtr_raw),columns=pre.get_feature_names_out())
Xte=pd.DataFrame(pre.transform(Xte_raw),columns=Xtr.columns)
for name,obj in [("train_unprocessed",Xtr_raw),("test_unprocessed",Xte_raw),("train_processed",Xtr),("test_processed",Xte),("y_train",ytr),("y_test",yte)]:
    obj.to_csv(ROOT/f"data/{name}.csv",index=False,encoding="utf-8-sig")
joblib.dump(pre,ROOT/"models/preprocessor.joblib")
print("№6:",Xtr.shape,Xte.shape, ytr.value_counts().to_dict())

# ========== №7: КЛАССИКАЛЫҚ КЛАССИФИКАЦИЯ ==========
models={
    "Logistic Regression":LogisticRegression(max_iter=2000,class_weight="balanced",random_state=SEED),
    "Decision Tree":DecisionTreeClassifier(max_depth=5,class_weight="balanced",random_state=SEED),
    "Random Forest":RandomForestClassifier(n_estimators=250,class_weight="balanced",random_state=SEED,n_jobs=-1)}
cv=StratifiedKFold(n_splits=5,shuffle=True,random_state=SEED)
scores=[]
for name,model in models.items():
    pipe=Pipeline([("preprocessor",clone(pre)),("classifier",clone(model))])
    v=cross_val_score(pipe,Xtr_raw,ytr,cv=cv,scoring="f1_macro")
    scores.append({"model":name,"mean_macro_f1":float(v.mean()),"std_macro_f1":float(v.std())})
comparison=pd.DataFrame(scores).sort_values("mean_macro_f1",ascending=False)
comparison.to_csv(ROOT/"reports/classifier_cv.csv",index=False)
classic_name=comparison.iloc[0]["model"]
classic=clone(models[classic_name]).fit(Xtr,ytr)
classic_pred=classic.predict(Xte)
classic_f1=float(f1_score(yte,classic_pred,labels=CLASSES,average="macro",zero_division=0))
joblib.dump(classic,ROOT/"models/classifier.joblib")
joblib.dump(Pipeline([("preprocessor",pre),("classifier",classic)]),ROOT/"models/classification_pipeline.joblib")
pd.DataFrame({"actual":yte.to_numpy(),"predicted":classic_pred}).to_csv(ROOT/"reports/test_predictions.csv",index=False)
classic_metrics={"selected_model":classic_name,"cv":scores,"test_macro_f1":classic_f1,"test_accuracy":float(accuracy_score(yte,classic_pred)),"report":classification_report(yte,classic_pred,labels=CLASSES,output_dict=True,zero_division=0)}
(ROOT/"reports/classifier_metrics.json").write_text(json.dumps(classic_metrics,ensure_ascii=False,indent=2),encoding="utf-8")
print("№7:",classic_name,"Macro-F1",round(classic_f1,4))

# ========== №8: K-MEANS КЛАСТЕРЛЕУ ==========
# Тек X белгілері; state кластерлеу кезінде қолданылмайды.
Xall=pd.concat([Xtr,Xte],ignore_index=True)
krows=[]
for k in range(2,9):
    km=KMeans(n_clusters=k,n_init=10,random_state=SEED)
    labels=km.fit_predict(Xall)
    krows.append({"k":k,"inertia":float(km.inertia_),"silhouette":float(silhouette_score(Xall,labels))})
k_table=pd.DataFrame(krows)
best_k=int(k_table.loc[k_table.silhouette.idxmax(),"k"])
cluster=KMeans(n_clusters=best_k,n_init=10,random_state=SEED).fit(Xall)
k_table.to_csv(ROOT/"reports/kmeans_scores.csv",index=False)
pd.DataFrame({"cluster_id":cluster.labels_}).to_csv(ROOT/"reports/kmeans_clusters.csv",index=False)
joblib.dump(cluster,ROOT/"models/kmeans.joblib")
fig,ax=plt.subplots(figsize=(7,4))
ax.plot(k_table.k,k_table.silhouette,marker="o")
ax.set(xlabel="k",ylabel="Silhouette",title="№8 K-Means")
fig.tight_layout();fig.savefig(ROOT/"reports/kmeans_silhouette.png",dpi=160);plt.show()
print("№8: best_k",best_k,"silhouette",round(k_table.silhouette.max(),4))

# ========== №9: MLP НЕЙРОНДЫҚ ЖЕЛІ ==========
arch={"small":(16,),"deep":(32,16)}
def make_mlp(layers):
    return MLPClassifier(hidden_layer_sizes=layers,activation="relu",solver="adam",
       alpha=.001,learning_rate_init=.001,max_iter=500,early_stopping=True,
       validation_fraction=.2,n_iter_no_change=20,random_state=SEED)
fit_x,val_x,fit_y,val_y=train_test_split(Xtr,ytr,test_size=.2,stratify=ytr,random_state=SEED)
validation={}
for name,layers in arch.items():
    m=make_mlp(layers).fit(fit_x,fit_y)
    validation[name]=float(f1_score(val_y,m.predict(val_x),labels=CLASSES,average="macro",zero_division=0))
best_name=max(validation,key=validation.get)
trained={name:make_mlp(layers).fit(Xtr,ytr) for name,layers in arch.items()}
results={}
for name,m in trained.items():
    pred=m.predict(Xte)
    results[name]={"macro_f1":float(f1_score(yte,pred,labels=CLASSES,average="macro",zero_division=0)),
       "accuracy":float(accuracy_score(yte,pred)),
       "per_class_recall":{c:float(v) for c,v in [(c,classification_report(yte,pred,labels=CLASSES,output_dict=True,zero_division=0)[c]["recall"]) for c in CLASSES]},
       "iterations":int(m.n_iter_),"final_loss":float(m.loss_)}
best=trained[best_name]
mlp_pred=best.predict(Xte)
agreement=float(np.mean(classic_pred==mlp_pred))
pd.DataFrame({"actual":yte.to_numpy(),"classic":classic_pred,"mlp":mlp_pred,"agree":classic_pred==mlp_pred}).to_csv(ROOT/"reports/model_agreement.csv",index=False,encoding="utf-8-sig")
fig,ax=plt.subplots(figsize=(8,4))
for name,m in trained.items(): ax.plot(m.loss_curve_,label=name)
ax.set(xlabel="Iteration",ylabel="Loss",title="№9 MLP loss curve")
ax.legend();fig.tight_layout();fig.savefig(ROOT/"reports/mlp_loss.png",dpi=160);plt.show()
# Learning curve — дерек санына тәуелді CV сапасы
sizes,train_scores,val_scores=learning_curve(make_mlp(arch[best_name]),Xtr,ytr,cv=3,scoring="f1_macro",train_sizes=np.linspace(.4,1,4),n_jobs=1)
fig,ax=plt.subplots(figsize=(8,4))
ax.plot(sizes,train_scores.mean(axis=1),marker="o",label="Train")
ax.plot(sizes,val_scores.mean(axis=1),marker="o",label="Validation")
ax.set(xlabel="Training samples",ylabel="Macro-F1",title="№9 Learning curve")
ax.legend();fig.tight_layout();fig.savefig(ROOT/"reports/mlp_learning_curve.png",dpi=160);plt.show()
prob=best.predict_proba(Xte)
examples=[]
for i in range(min(10,len(Xte))):
    examples.append({"index":i,"actual":str(yte.iloc[i]),"predicted":str(mlp_pred[i]),
       "probabilities":{str(c):float(p) for c,p in zip(best.classes_,prob[i])}})
metrics={"variant":3,"validation_macro_f1":validation,"selected_architecture":best_name,
         "architectures":results,"classic_model":classic_name,"classic_macro_f1":classic_f1,
         "agreement_first_10":float(np.mean(classic_pred[:10]==mlp_pred[:10])),
         "agreement_all":agreement,"probability_examples":examples,
         "note":"Synthetic educational labels; probabilities are not calibrated industrial risk."}
(ROOT/"reports/mlp_metrics.json").write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding="utf-8")
joblib.dump({"model":best,"feature_order":list(Xtr.columns),"architecture":best_name,"classes":list(best.classes_)},ROOT/"models/mlp.joblib")
print("№9:",best_name,"Macro-F1",round(results[best_name]["macro_f1"],4),"№7 келісу",round(agreement,4))
print("Барлық нәтижелер:",ROOT.resolve())
