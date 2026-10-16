# ryzen budget noise A/B, 2026-10-15

Round-robin A B C D E x 8 rounds, fresh page load per sample, 1440p high, gpu p95 ms, under hwlock ryzen-budget, console-session Playwright server, ww2airsim-3 slot, origin/main 996565d2.
A=as found, B=Agent stopped, C=Agent+LightingService stopped, D=High performance plan, E=B+D.

| view | cond | n | median | min | max | max-min | samples in round order |
|---|---|---|---|---|---|---|---|
| runway | A | 8 | 14.02 | 8.45 | 15.16 | 6.7 | 13.9, 8.9, 8.5, 12.6, 14.1, 15.1, 15.2, 14.6 |
| runway | B | 8 | 14.36 | 11.99 | 14.90 | 2.9 | 14.9, 14.7, 12.0, 14.1, 14.2, 12.5, 14.5, 14.7 |
| runway | C | 8 | 12.92 | 11.98 | 15.32 | 3.3 | 15.3, 12.3, 13.2, 12.6, 14.6, 12.0, 14.4, 12.6 |
| runway | D | 8 | 13.86 | 8.87 | 14.53 | 5.7 | 14.2, 14.5, 13.8, 8.9, 13.4, 13.7, 13.9, 14.0 |
| runway | E | 8 | 14.59 | 14.05 | 14.94 | 0.9 | 14.6, 14.5, 14.6, 14.9, 14.4, 14.7, 14.1, 14.7 |
| low-land-600 | A | 8 | 9.50 | 5.21 | 13.46 | 8.2 | 12.2, 6.1, 12.7, 11.7, 13.5, 5.2, 6.7, 7.3 |
| low-land-600 | B | 8 | 12.60 | 9.00 | 13.67 | 4.7 | 11.7, 12.5, 9.0, 12.7, 10.9, 13.3, 13.7, 13.5 |
| low-land-600 | C | 8 | 11.17 | 7.05 | 12.39 | 5.3 | 10.8, 7.2, 7.1, 11.8, 12.2, 12.4, 11.3, 11.1 |
| low-land-600 | D | 8 | 10.29 | 5.53 | 13.09 | 7.6 | 5.9, 9.2, 12.8, 7.9, 13.1, 5.5, 12.2, 11.4 |
| low-land-600 | E | 8 | 12.05 | 7.11 | 13.44 | 6.3 | 13.0, 12.3, 11.1, 11.3, 7.1, 12.7, 13.4, 11.8 |

## Raw
```
1,A,runway,06:26:01,BUDGET 1440p high runway p95=13.946 n=284
1,A,low-land-600,06:26:21,BUDGET 1440p high low-land-600 p95=12.167 n=343
1,B,runway,06:26:51,BUDGET 1440p high runway p95=14.897 n=287
1,B,low-land-600,06:27:11,BUDGET 1440p high low-land-600 p95=11.670 n=369
1,C,runway,06:27:41,BUDGET 1440p high runway p95=15.318 n=274
1,C,low-land-600,06:28:01,BUDGET 1440p high low-land-600 p95=10.810 n=383
1,D,runway,06:28:33,BUDGET 1440p high runway p95=14.225 n=277
1,D,low-land-600,06:28:53,BUDGET 1440p high low-land-600 p95=5.931 n=425
1,E,runway,06:29:24,BUDGET 1440p high runway p95=14.569 n=285
1,E,low-land-600,06:29:43,BUDGET 1440p high low-land-600 p95=12.986 n=356
2,A,runway,06:30:14,BUDGET 1440p high runway p95=8.943 n=363
2,A,low-land-600,06:30:35,BUDGET 1440p high low-land-600 p95=6.123 n=411
2,B,runway,06:31:05,BUDGET 1440p high runway p95=14.736 n=290
2,B,low-land-600,06:31:25,BUDGET 1440p high low-land-600 p95=12.493 n=377
2,C,runway,06:31:55,BUDGET 1440p high runway p95=12.325 n=358
2,C,low-land-600,06:32:15,BUDGET 1440p high low-land-600 p95=7.239 n=423
2,D,runway,06:32:47,BUDGET 1440p high runway p95=14.525 n=274
2,D,low-land-600,06:33:07,BUDGET 1440p high low-land-600 p95=9.195 n=381
2,E,runway,06:33:38,BUDGET 1440p high runway p95=14.545 n=288
2,E,low-land-600,06:33:58,BUDGET 1440p high low-land-600 p95=12.305 n=383
3,A,runway,06:34:29,BUDGET 1440p high runway p95=8.454 n=371
3,A,low-land-600,06:34:49,BUDGET 1440p high low-land-600 p95=12.702 n=345
3,B,runway,06:35:19,BUDGET 1440p high runway p95=11.988 n=367
3,B,low-land-600,06:35:39,BUDGET 1440p high low-land-600 p95=8.997 n=407
3,C,runway,06:36:09,BUDGET 1440p high runway p95=13.215 n=311
3,C,low-land-600,06:36:29,BUDGET 1440p high low-land-600 p95=7.053 n=422
3,D,runway,06:37:01,BUDGET 1440p high runway p95=13.832 n=285
3,D,low-land-600,06:37:21,BUDGET 1440p high low-land-600 p95=12.765 n=336
3,E,runway,06:37:51,BUDGET 1440p high runway p95=14.618 n=286
3,E,low-land-600,06:38:11,BUDGET 1440p high low-land-600 p95=11.093 n=379
4,A,runway,06:38:42,BUDGET 1440p high runway p95=12.580 n=310
4,A,low-land-600,06:39:02,BUDGET 1440p high low-land-600 p95=11.685 n=354
4,B,runway,06:39:33,BUDGET 1440p high runway p95=14.061 n=283
4,B,low-land-600,06:39:53,BUDGET 1440p high low-land-600 p95=12.716 n=355
4,C,runway,06:40:23,BUDGET 1440p high runway p95=12.559 n=350
4,C,low-land-600,06:40:43,BUDGET 1440p high low-land-600 p95=11.812 n=390
4,D,runway,06:41:14,BUDGET 1440p high runway p95=8.873 n=367
4,D,low-land-600,06:41:34,BUDGET 1440p high low-land-600 p95=7.926 n=383
4,E,runway,06:42:05,BUDGET 1440p high runway p95=14.935 n=284
4,E,low-land-600,06:42:25,BUDGET 1440p high low-land-600 p95=11.330 n=374
5,A,runway,06:42:56,BUDGET 1440p high runway p95=14.087 n=277
5,A,low-land-600,06:43:16,BUDGET 1440p high low-land-600 p95=13.460 n=326
5,B,runway,06:43:47,BUDGET 1440p high runway p95=14.208 n=290
5,B,low-land-600,06:44:07,BUDGET 1440p high low-land-600 p95=10.921 n=383
5,C,runway,06:44:37,BUDGET 1440p high runway p95=14.558 n=289
5,C,low-land-600,06:44:57,BUDGET 1440p high low-land-600 p95=12.204 n=364
5,D,runway,06:45:28,BUDGET 1440p high runway p95=13.405 n=291
5,D,low-land-600,06:45:48,BUDGET 1440p high low-land-600 p95=13.088 n=338
5,E,runway,06:46:19,BUDGET 1440p high runway p95=14.369 n=282
5,E,low-land-600,06:46:39,BUDGET 1440p high low-land-600 p95=7.107 n=421
6,A,runway,06:47:10,BUDGET 1440p high runway p95=15.071 n=274
6,A,low-land-600,06:47:30,BUDGET 1440p high low-land-600 p95=5.211 n=436
6,B,runway,06:48:01,BUDGET 1440p high runway p95=12.480 n=360
6,B,low-land-600,06:48:21,BUDGET 1440p high low-land-600 p95=13.326 n=347
6,C,runway,06:48:51,BUDGET 1440p high runway p95=11.978 n=368
6,C,low-land-600,06:49:11,BUDGET 1440p high low-land-600 p95=12.395 n=362
6,D,runway,06:49:42,BUDGET 1440p high runway p95=13.651 n=294
6,D,low-land-600,06:50:02,BUDGET 1440p high low-land-600 p95=5.531 n=436
6,E,runway,06:50:33,BUDGET 1440p high runway p95=14.670 n=294
6,E,low-land-600,06:50:53,BUDGET 1440p high low-land-600 p95=12.728 n=349
7,A,runway,06:51:24,BUDGET 1440p high runway p95=15.163 n=271
7,A,low-land-600,06:51:44,BUDGET 1440p high low-land-600 p95=6.735 n=408
7,B,runway,06:52:15,BUDGET 1440p high runway p95=14.514 n=292
7,B,low-land-600,06:52:35,BUDGET 1440p high low-land-600 p95=13.668 n=340
7,C,runway,06:53:05,BUDGET 1440p high runway p95=14.382 n=291
7,C,low-land-600,06:53:25,BUDGET 1440p high low-land-600 p95=11.284 n=379
7,D,runway,06:53:57,BUDGET 1440p high runway p95=13.894 n=278
7,D,low-land-600,06:54:17,BUDGET 1440p high low-land-600 p95=12.239 n=348
7,E,runway,06:54:48,BUDGET 1440p high runway p95=14.052 n=285
7,E,low-land-600,06:55:07,BUDGET 1440p high low-land-600 p95=13.438 n=337
8,A,runway,06:55:39,BUDGET 1440p high runway p95=14.611 n=282
8,A,low-land-600,06:55:58,BUDGET 1440p high low-land-600 p95=7.324 n=404
8,B,runway,06:56:29,BUDGET 1440p high runway p95=14.747 n=289
8,B,low-land-600,06:56:49,BUDGET 1440p high low-land-600 p95=13.476 n=328
8,C,runway,06:57:19,BUDGET 1440p high runway p95=12.626 n=368
8,C,low-land-600,06:57:39,BUDGET 1440p high low-land-600 p95=11.062 n=384
8,D,runway,06:58:11,BUDGET 1440p high runway p95=13.957 n=284
8,D,low-land-600,06:58:31,BUDGET 1440p high low-land-600 p95=11.388 n=354
8,E,runway,06:59:02,BUDGET 1440p high runway p95=14.705 n=272
8,E,low-land-600,06:59:21,BUDGET 1440p high low-land-600 p95=11.805 n=368

```
## Condition probes
```
1 cond=A agent=Running light=Running plan=Balanced cpu=1.8
1 cond=B agent=Stopped light=Running plan=Balanced cpu=3.1
1 cond=C agent=Stopped light=Stopped plan=Balanced cpu=0
1 cond=D agent=Running light=Running plan=High performance cpu=2.2
1 cond=E agent=Stopped light=Running plan=High performance cpu=1.4
2 cond=A agent=Running light=Running plan=Balanced cpu=3.9
2 cond=B agent=Stopped light=Running plan=Balanced cpu=1.3
2 cond=C agent=Stopped light=Stopped plan=Balanced cpu=0.8
2 cond=D agent=Running light=Running plan=High performance cpu=3
2 cond=E agent=Stopped light=Running plan=High performance cpu=3.9
3 cond=A agent=Running light=Running plan=Balanced cpu=3.3
3 cond=B agent=Stopped light=Running plan=Balanced cpu=1.5
3 cond=C agent=Stopped light=Stopped plan=Balanced cpu=0
3 cond=D agent=Running light=Running plan=High performance cpu=1.1
3 cond=E agent=Stopped light=Running plan=High performance cpu=3.9
4 cond=A agent=Running light=Running plan=Balanced cpu=4.5
4 cond=B agent=Stopped light=Running plan=Balanced cpu=0.8
4 cond=C agent=Stopped light=Stopped plan=Balanced cpu=2.4
4 cond=D agent=Running light=Running plan=High performance cpu=4.3
4 cond=E agent=Stopped light=Running plan=High performance cpu=2.6
5 cond=A agent=Running light=Running plan=Balanced cpu=3.3
5 cond=B agent=Stopped light=Running plan=Balanced cpu=0.3
5 cond=C agent=Stopped light=Stopped plan=Balanced cpu=0.2
5 cond=D agent=Running light=Running plan=High performance cpu=5.3
5 cond=E agent=Stopped light=Running plan=High performance cpu=0.3
6 cond=A agent=Running light=Running plan=Balanced cpu=1.7
6 cond=B agent=Stopped light=Running plan=Balanced cpu=2.4
6 cond=C agent=Stopped light=Stopped plan=Balanced cpu=0
6 cond=D agent=Running light=Running plan=High performance cpu=3.9
6 cond=E agent=Stopped light=Running plan=High performance cpu=3.9
7 cond=A agent=Running light=Running plan=Balanced cpu=5.8
7 cond=B agent=Stopped light=Running plan=Balanced cpu=6.7
7 cond=C agent=Stopped light=Stopped plan=Balanced cpu=0.7
7 cond=D agent=Running light=Running plan=High performance cpu=3.7
7 cond=E agent=Stopped light=Running plan=High performance cpu=1.1
8 cond=A agent=Running light=Running plan=Balanced cpu=3.1
8 cond=B agent=Stopped light=Running plan=Balanced cpu=0
8 cond=C agent=Stopped light=Stopped plan=Balanced cpu=1.8
8 cond=D agent=Running light=Running plan=High performance cpu=2.4
8 cond=E agent=Stopped light=Running plan=High performance cpu=0.9

```
## Original state
```
{
    "power":  "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)",
    "services":  [
                     "Agent Running Automatic",
                     "LightingService Running Automatic"
                 ],
    "procs":  [
                  "Aac3572MbHal_x86 pid=16248 start=10/14/2026 08:33:14",
                  "Aac3572MbHal_x86 pid=35796 start=10/14/2026 19:32:04",
                  "Agent pid=15412 start=10/14/2026 08:34:45",
                  "LibreHardwareMonitor pid=16652 start=10/14/2026 19:31:38",
                  "LightingService pid=8056 start=10/14/2026 08:32:44",
                  "pythonw pid=17852 start=10/14/2026 19:31:38"
              ]
}

```
## Restored state (read back at end)
```
Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
Agent Running Automatic; LightingService Running Automatic; Agent cpu 2s of 5s (~40% of a core) after restart
```