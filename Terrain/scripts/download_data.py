"""Download official NASA LOLA DEMs after confirming NASA site availability.

Large-area 80 m file is ~181 MB, 5 m site files may also be large.
Downloads are never automatically included in version control.
"""
import argparse
from pathlib import Path
import requests

BASE_5M = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp'
BASE_80M = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp'
FILES = {
  'regional-80m': f'{BASE_80M}/LDEM_80S_80MPP_ADJ.TIF',
  'site01-elevation': f'{BASE_5M}/Site01/Site01_final_adj_5mpp_surf.tif',
  'site01-slope': f'{BASE_5M}/Site01/Site01_final_adj_5mpp_slp.tif',
  'site04-elevation': f'{BASE_5M}/Site04/Site04_final_adj_5mpp_surf.tif',
  'site04-slope': f'{BASE_5M}/Site04/Site04_final_adj_5mpp_slp.tif',
  'site23-elevation': f'{BASE_5M}/Site23/Site23_final_adj_5mpp_surf.tif',
  'site23-slope': f'{BASE_5M}/Site23/Site23_final_adj_5mpp_slp.tif',
}


def download(url, target):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix+'.part')
    try:
        with requests.get(url, stream=True, timeout=(20, 120)) as response:
            response.raise_for_status()
            with partial.open('wb') as f:
                total = 0
                for chunk in response.iter_content(chunk_size=2**20):
                    if chunk:
                        f.write(chunk)
                        total += len(chunk)
                        if total % (20*2**20) < 2**20:
                            print(f'  {total/2**20:.0f} MiB', flush=True)
        if total < 1024:
            raise RuntimeError(f'Download too small to be a terrain file: {total} bytes')
        partial.replace(target)
        return target
    except Exception:
        partial.unlink(missing_ok=True)
        raise


def main():
    ap = argparse.ArgumentParser(description='Retrieve NASA LOLA GeoTIFF files')
    ap.add_argument('keys', nargs='+', choices=sorted(FILES))
    ap.add_argument('--out', default='data/raw')
    args = ap.parse_args()
    for key in args.keys:
        url = FILES[key]
        dest = Path(args.out)/url.rsplit('/', 1)[-1]
        if dest.exists():
            print(f'{dest} already exists; skipping')
            continue
        print(f'{key}: {url}', flush=True)
        print('saved:', download(url, dest), flush=True)

if __name__ == '__main__':
    main()
