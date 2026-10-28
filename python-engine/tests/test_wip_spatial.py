import base64
import io
from pathlib import Path
import sys
import unittest
from PIL import Image
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from readers.wip_spatial import overlay, annotate

class SpatialTests(unittest.TestCase):
    def setUp(self):
        self.image=dict(valid=True,project_hash='same',system_id='instrument',matrix_um=[[2,0,10],[0,-2,30],[0,0,1]],width=100,height=100,um_per_pixel_x=2)
        self.map=dict(self.image,matrix_um=[[0,-2,20],[2,0,20],[0,0,1]],width=5,height=3)

    def test_rotation_negative_y_and_grid(self):
        shape=overlay(self.image,self.map,True)
        np.testing.assert_allclose(shape['polygon'],[[5,5],[5,0],[2,0],[2,5]])
        self.assertEqual(len(shape['points']),15)
        self.assertEqual(overlay(self.image,dict(self.map,width=100,height=100),True)['points'],[])

    def test_frame_and_calibration(self):
        for changed in [dict(self.map,valid=False),dict(self.map,project_hash='other'),dict(self.map,system_id='other')]:
            with self.assertRaises(ValueError):overlay(self.image,changed)

    def test_export_keeps_original(self):
        source=Image.new('RGB',(100,100),'white');before=source.tobytes()
        result=Image.open(io.BytesIO(base64.b64decode(annotate(source,self.image,[self.map],40,True))))
        self.assertEqual(result.size,source.size)
        self.assertNotEqual(result.tobytes(),before)
        self.assertEqual(source.tobytes(),before)

if __name__=='__main__':unittest.main()
