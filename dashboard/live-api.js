/**
 * Browser-side transport contract.
 * A deployment can inject the real Worker base URL/token through the host
 * environment; this package stores neither.
 */
export async function callWorker(baseUrl, path, options={}) {
 if(!baseUrl || !/^https:\/\//i.test(baseUrl)) throw new Error("INVALID_WORKER_URL");
 const url = new URL(path, baseUrl).toString();
 const res = await fetch(url, {
   method: options.method || "GET",
   headers: {"content-type":"application/json", ...(options.headers||{})},
   body: options.body ? JSON.stringify(options.body) : undefined
 });
 const text=await res.text();
 let data; try { data=JSON.parse(text); } catch { data={raw:text}; }
 if(!res.ok) throw new Error(`WORKER_HTTP_${res.status}`);
 return data;
}
